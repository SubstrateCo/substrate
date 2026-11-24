import type { CrmActivityInput } from "@substrate/contracts/crm/activity";
import { dealFields, crmWrite } from "@substrate/contracts/crm/input";

import { requireAppEnabledForActiveActor } from "../../../core/apps/access";
import { contactReadable } from "../../../core/contacts/access";
import { parseInput } from "../../../core/contacts/inputs";
import { contacts } from "../../../core/contacts/schema";
import { RepositoryContext, pageSize } from "../../../core/repository-context";
import { previousRequest, recordRequest, requestFingerprint } from "../../../core/requests/once";
import { AccessDeniedError, ConflictError, ValidationError } from "../../../errors";
import { recordCrmActivity } from "../activity";
import { createOnce } from "../creation";
import { crmRecordAccess, type ListOptions } from "../record-access";
import { crmAccounts, crmStages, crmDeals, crmDealContacts } from "../schema";
import { requireDealRelations } from "./deal-relations";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
type DealInput = z.input<typeof dealFields>;
type Transition = Extract<z.output<typeof crmWrite>, { action: "transitionDeal" }>;

export function crmDealsRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const org = scope.organizationId;
  const { changed, target, requireType, owner, listWhere } = crmRecordAccess(context);
  async function validateDeal(
    ctx: RepositoryContext,
    value: z.output<typeof dealFields>,
    options: { hasRetainedRelationships?: boolean; requireActiveStage?: boolean } = {},
  ) {
    if (
      !value.accountEntityId &&
      !value.contactEntityIds.length &&
      !options.hasRetainedRelationships
    )
      throw new ValidationError("Choose an account or contact.");
    if ((value.amount === null) !== (value.currency === null))
      throw new ValidationError("Amount and currency must be supplied together.");
    if (value.currency && !Intl.supportedValuesOf("currency").includes(value.currency))
      throw new ValidationError("Choose a supported currency.");
    if (
      value.primaryContactEntityId &&
      !value.contactEntityIds.includes(value.primaryContactEntityId)
    )
      throw new ValidationError("The primary contact must be a participant.");
    if (new Set(value.contactEntityIds).size !== value.contactEntityIds.length)
      throw new ValidationError("Participant contacts must be unique.");
    // Both callers proved the actor active: owner() on create, requireType on update.
    await requireDealRelations(ctx, value, { actorChecked: true });
    if (options.requireActiveStage !== false) await requireStage(ctx, value.stageId);
  }
  async function presentDeal(ctx: RepositoryContext, row: typeof crmDeals.$inferSelect) {
    if (!row.accountEntityId) return row;
    const [account] = await ctx.db
      .select({ id: crmAccounts.entityId })
      .from(crmAccounts)
      .where(and(target(crmAccounts, row.accountEntityId), ctx.readable(crmAccounts.entityId)));
    return { ...row, accountEntityId: account?.id ?? null };
  }
  async function requireStage(ctx: RepositoryContext, id: string) {
    const [stage] = await ctx.db
      .select()
      .from(crmStages)
      .where(
        and(eq(crmStages.organizationId, org), eq(crmStages.id, id), eq(crmStages.retired, false)),
      );
    if (!stage) throw new ValidationError("Choose an active stage.");
  }
  async function participants(
    ctx: RepositoryContext,
    id: string,
    value: z.output<typeof dealFields>,
    retained: { contactEntityId: string; isPrimary: boolean }[] = [],
    created = false,
  ) {
    if (!created)
      await ctx.db
        .delete(crmDealContacts)
        .where(and(eq(crmDealContacts.organizationId, org), eq(crmDealContacts.dealEntityId, id)));
    if (value.contactEntityIds.length || retained.length)
      await ctx.db.insert(crmDealContacts).values([
        ...[...new Set(value.contactEntityIds)].map((contactEntityId) => ({
          organizationId: org,
          dealEntityId: id,
          contactEntityId,
          isPrimary: contactEntityId === value.primaryContactEntityId,
        })),
        ...retained.map((row) => ({
          organizationId: org,
          dealEntityId: id,
          contactEntityId: row.contactEntityId,
          isPrimary: value.primaryContactEntityId ? false : row.isPrimary,
        })),
      ]);
  }
  // Call after requireType(ctx, id, "deal", true) in the same transaction. This read does not
  // stop a concurrent change: the caller's UPDATE must match the version again (dealAt).
  async function currentDeal(ctx: RepositoryContext, id: string, version: number) {
    const [deal] = await ctx.db.select().from(crmDeals).where(target(crmDeals, id));
    if (!deal) throw new AccessDeniedError();
    if (deal.version !== version)
      throw new ConflictError("The deal changed. Reload and try again.");
    if (deal.archivedAt) throw new ValidationError("Restore the deal first.");
    return deal;
  }
  const dealAt = (id: string, version: number) =>
    and(target(crmDeals, id), eq(crmDeals.version, version));
  const dealChanged = () => new ConflictError("The deal changed. Reload and try again.");
  return {
    async createDeal(input: DealInput & { requestId?: string }) {
      const value = parseInput(dealFields, input);
      return createOnce(
        context,
        "deal",
        input.requestId,
        { ...value, contactEntityIds: [...value.contactEntityIds].sort() },
        async (ctx) => {
          const ownerActorEntityId = await owner(ctx);
          await validateDeal(ctx, value);
          const entity = await ctx.createEntity("deal");
          const { contactEntityIds: _, primaryContactEntityId: __, ...fields } = value;
          const [row] = await ctx.db
            .insert(crmDeals)
            .values({
              ...fields,
              entityType: "deal",
              organizationId: org,
              entityId: entity.entityId,
              ownerActorEntityId,
            })
            .returning();
          await participants(ctx, entity.entityId, value, [], true);
          changed(ctx, entity.entityId);
          await recordCrmActivity(ctx, { entityId: entity.entityId, action: "created" });
          return row!;
        },
        async (ctx, id) => (await crmDealsRepository(ctx).getDeal(id)).deal,
      );
    },
    async updateDeal(id: string, expectedVersion: number, input: DealInput) {
      const value = parseInput(dealFields, input);
      return context.transaction(async (ctx) => {
        const access = await requireType(ctx, id, "deal", true);
        const previous = await currentDeal(ctx, id, expectedVersion);
        if (previous.stageId !== value.stageId)
          throw new ValidationError("Use a stage transition to change stage.");
        const previousParticipants = await ctx.db
          .select({
            contactEntityId: crmDealContacts.contactEntityId,
            isPrimary: crmDealContacts.isPrimary,
            readable: sql<boolean>`${contactReadable(ctx, crmDealContacts.contactEntityId)}`,
          })
          .from(crmDealContacts)
          .where(
            and(eq(crmDealContacts.organizationId, org), eq(crmDealContacts.dealEntityId, id)),
          );
        const priorParticipants = previousParticipants.map(({ contactEntityId, isPrimary }) => ({
          contactEntityId,
          isPrimary,
        }));
        const retained = previousParticipants.flatMap(({ readable, ...row }) =>
          readable ? [] : [row],
        );
        const [visibleAccount] = previous.accountEntityId
          ? await ctx.db
              .select({ id: crmAccounts.entityId })
              .from(crmAccounts)
              .where(
                and(
                  target(crmAccounts, previous.accountEntityId),
                  ctx.readable(crmAccounts.entityId),
                ),
              )
          : [];
        const retainedAccountId =
          previous.accountEntityId && !visibleAccount && !value.accountEntityId
            ? previous.accountEntityId
            : null;
        await validateDeal(ctx, value, {
          hasRetainedRelationships: !!retainedAccountId || retained.length > 0,
          requireActiveStage: false,
        });
        const { contactEntityIds: _, primaryContactEntityId: __, ...fields } = value;
        const nextParticipants = [
          ...value.contactEntityIds.map((contactEntityId) => ({
            contactEntityId,
            isPrimary: contactEntityId === value.primaryContactEntityId,
          })),
          ...retained.map((row) => ({
            ...row,
            isPrimary: value.primaryContactEntityId ? false : row.isPrimary,
          })),
        ];
        const changedFields: NonNullable<CrmActivityInput["changedFields"]> = (
          ["title", "currency", "expectedCloseDate", "summary"] as const
        ).filter((key) => previous[key] !== value[key]);
        if (previous.accountEntityId !== (retainedAccountId ?? fields.accountEntityId))
          changedFields.push("account");
        if (moneyKey(previous.amount) !== moneyKey(value.amount)) changedFields.push("amount");
        if (participantKey(priorParticipants) !== participantKey(nextParticipants))
          changedFields.push("contacts");
        await ctx.touch(id);
        const [row] = await ctx.db
          .update(crmDeals)
          .set({
            ...fields,
            accountEntityId: retainedAccountId ?? fields.accountEntityId,
            version: previous.version + 1,
          })
          .where(dealAt(id, previous.version))
          .returning();
        // The row is now held by this write, so the participant rewrite cannot interleave.
        if (!row) throw dealChanged();
        await participants(ctx, id, value, retained);
        changed(ctx, id);
        if (changedFields.length)
          await recordCrmActivity(ctx, { entityId: id, action: "updated", changedFields }, access);
        return presentDeal(ctx, row);
      });
    },
    async transitionDeal(
      id: string,
      input: Omit<Transition, "action" | "organizationId" | "entityId">,
    ) {
      return context.transaction(async (ctx) => {
        const access = await requireType(ctx, id, "deal", true);
        const fingerprint = requestFingerprint([
          id,
          input.expectedVersion,
          input.stageId,
          input.outcome,
          input.lostReason ?? null,
        ]);
        if (await previousRequest(ctx, "deal_transition", input.requestId, fingerprint)) {
          const [row] = await ctx.db.select().from(crmDeals).where(target(crmDeals, id));
          changed(ctx, id);
          return presentDeal(ctx, row!);
        }
        const previous = await currentDeal(ctx, id, input.expectedVersion);
        await requireStage(ctx, input.stageId);
        const now = new Date();
        let closedAt = previous.outcome === input.outcome ? previous.closedAt : now;
        if (input.outcome === "open") closedAt = null;
        await ctx.touch(id);
        const [row] = await ctx.db
          .update(crmDeals)
          .set({
            stageId: input.stageId,
            outcome: input.outcome,
            lostReason: input.outcome === "lost" ? input.lostReason : null,
            version: previous.version + 1,
            stageEnteredAt: previous.stageId === input.stageId ? previous.stageEnteredAt : now,
            closedAt,
          })
          .where(dealAt(id, previous.version))
          .returning();
        if (!row) throw dealChanged();
        await recordRequest(ctx, "deal_transition", input.requestId, id);
        changed(ctx, id);
        const changedFields: NonNullable<CrmActivityInput["changedFields"]> = [];
        if (previous.stageId !== input.stageId) changedFields.push("stage");
        if (previous.outcome !== input.outcome) changedFields.push("outcome");
        if (previous.lostReason !== row.lostReason) changedFields.push("lostReason");
        if (changedFields.length)
          await recordCrmActivity(
            ctx,
            { entityId: id, action: "stage_changed", changedFields },
            access,
          );
        return presentDeal(ctx, row);
      });
    },
    async listDeals(options: ListOptions = {}) {
      await requireAppEnabledForActiveActor(context, "crm");
      const rows = await db
        .select()
        .from(crmDeals)
        .where(
          and(
            listWhere(crmDeals, options),
            options.outcome ? eq(crmDeals.outcome, options.outcome) : undefined,
          ),
        )
        .orderBy(asc(crmDeals.entityId))
        .limit(pageSize(options.limit));
      const accountIds = [
        ...new Set(rows.flatMap((row) => (row.accountEntityId ? [row.accountEntityId] : []))),
      ];
      const accounts = accountIds.length
        ? await db
            .select({ id: crmAccounts.entityId })
            .from(crmAccounts)
            .where(
              and(
                eq(crmAccounts.organizationId, org),
                inArray(crmAccounts.entityId, accountIds),
                context.readable(crmAccounts.entityId),
              ),
            )
        : [];
      const readableAccounts = new Set(accounts.map((account) => account.id));
      return rows.map((row) => ({
        ...row,
        accountEntityId:
          row.accountEntityId && readableAccounts.has(row.accountEntityId)
            ? row.accountEntityId
            : null,
      }));
    },
    async getDeal(id: string) {
      const access = await requireType(context, id, "deal");
      const [raw] = await db.select().from(crmDeals).where(target(crmDeals, id));
      if (!raw) throw new AccessDeniedError();
      const [account] = raw.accountEntityId
        ? await db
            .select()
            .from(crmAccounts)
            .where(
              and(target(crmAccounts, raw.accountEntityId), context.readable(crmAccounts.entityId)),
            )
        : [];
      const people = await db
        .select({ contact: contacts, isPrimary: crmDealContacts.isPrimary })
        .from(crmDealContacts)
        .innerJoin(
          contacts,
          and(
            eq(contacts.organizationId, crmDealContacts.organizationId),
            eq(contacts.entityId, crmDealContacts.contactEntityId),
          ),
        )
        .where(
          and(
            eq(crmDealContacts.organizationId, org),
            eq(crmDealContacts.dealEntityId, id),
            contactReadable(context, contacts.entityId),
          ),
        );
      return {
        deal: { ...raw, accountEntityId: account?.entityId ?? null },
        account: account ?? null,
        contacts: people,
        level: access.level,
      };
    },
  };
}
function moneyKey(amount: string | null) {
  if (amount === null) return null;
  const [whole = "0", fraction = ""] = amount.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
}
function participantKey(rows: { contactEntityId: string; isPrimary: boolean }[]) {
  return rows
    .map((row) => `${row.contactEntityId}:${row.isPrimary}`)
    .sort()
    .join(",");
}
