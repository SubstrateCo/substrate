import type { CrmActivityInput } from "@substrate/contracts/crm/activity";
import type { RecordArchiveFilter } from "@substrate/contracts/crm/input";
import { accountFields, dealFields, crmWrite } from "@substrate/contracts/crm/input";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { permissionActorEntityId } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { requireAppEnabled } from "../../core/apps/access";
import { parseInput } from "../../core/contacts/inputs";
import { contacts } from "../../core/contacts/schema";
import { RepositoryContext, entityCursor, pageSize } from "../../core/repository-context";
import { previousRequest, recordRequest, requestFingerprint } from "../../core/requests/once";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { recordCrmActivity, recordCrmActivities, listCrmActivity } from "./activity";
import { createOnce } from "./creation";
import { requireDealRelations } from "./deal-relations";
import { createFollowUp, followUps } from "./follow-ups";
import { homeDeals } from "./home";
import { crmManagementRepository } from "./management";
import { assignOwner } from "./ownership";
import { report, reportDeals } from "./reports";
import {
  crmAccounts,
  crmAffiliations,
  crmContactProfiles,
  crmStages,
  crmDeals,
  crmDealContacts,
} from "./schema";
import { requireHumanCrmAdmin, settingsRepository } from "./settings";
import { crmSharing } from "./sharing";
import { timeline } from "./timeline";
import { and, asc, eq, gt, ilike, inArray, isNull, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

type ListOptions = {
  limit?: number;
  afterEntityId?: string;
  search?: string;
  archived?: RecordArchiveFilter;
};
type DealInput = z.input<typeof dealFields>;
type Transition = Extract<z.output<typeof crmWrite>, { action: "transitionDeal" }>;
export function crmRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const org = scope.organizationId;
  function changed(ctx: RepositoryContext, id: string) {
    ctx.effects.hint({ audience: realtimeKeys.entity(org, id), domain: "context" });
  }
  const target = (table: typeof crmAccounts | typeof crmDeals, id: string) =>
    and(eq(table.organizationId, org), eq(table.entityId, id));
  async function requireType(
    ctx: RepositoryContext,
    id: string,
    type: "account" | "deal" | "contact",
    edit = false,
  ) {
    await requireAppEnabled(ctx, "crm", edit);
    const access = await ctx.requireAccess(id, edit ? "edit" : "view", edit);
    if (access.entity.entityType !== type) throw new AccessDeniedError();
    return access;
  }
  async function requireAffiliationAccess(
    ctx: RepositoryContext,
    contactId: string,
    accountId: string,
  ) {
    await ctx.lockAccessPaths([contactId, accountId]);
    await requireAppEnabled(ctx, "crm", true);
    const access = await ctx.requireAccessAll([contactId, accountId], "edit");
    const types = new Map(access.map(({ entity }) => [entity.entityId, entity.entityType]));
    if (types.get(contactId) !== "contact" || types.get(accountId) !== "account")
      throw new AccessDeniedError();
  }
  async function owner(ctx: RepositoryContext) {
    await ctx.requireActiveActor();
    const [person] = await ctx.db
      .select({ id: actors.entityId })
      .from(actors)
      .where(
        and(eq(actors.organizationId, org), eq(actors.entityId, permissionActorEntityId(scope))),
      );
    if (!person) throw new AccessDeniedError();
    const actor = await ctx.requireActiveActor(person.id);
    if (actor.type !== "human")
      throw new ValidationError("CRM records require a human responsible owner.");
    return actor.entityId;
  }
  function listWhere(table: typeof crmAccounts | typeof crmDeals, options: ListOptions) {
    const afterEntityId = entityCursor(options.afterEntityId);
    let archiveFilter;
    if (options.archived !== "all")
      archiveFilter =
        options.archived === "archived" ? isNotNull(table.archivedAt) : isNull(table.archivedAt);
    return and(
      eq(table.organizationId, org),
      context.readable(table.entityId),
      afterEntityId ? gt(table.entityId, afterEntityId) : undefined,
      archiveFilter,
      options.search
        ? ilike(
            "name" in table ? table.name : table.title,
            `%${options.search.replace(/[\\%_]/g, "\\$&")}%`,
          )
        : undefined,
    );
  }
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
    await ctx.lockAccessPaths([
      ...new Set([
        ...(value.accountEntityId ? [value.accountEntityId] : []),
        ...value.contactEntityIds,
      ]),
    ]);
    await requireDealRelations(ctx, value);
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
      )
      .for("share");
    if (!stage) throw new ValidationError("Choose an active stage.");
  }
  async function participants(
    ctx: RepositoryContext,
    id: string,
    value: z.output<typeof dealFields>,
    retained: { contactEntityId: string; isPrimary: boolean }[] = [],
  ) {
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
  async function lockedDeal(ctx: RepositoryContext, id: string, version: number) {
    await requireType(ctx, id, "deal", true);
    // The entity access lock already serializes deal edits, transitions, and archiving.
    const [deal] = await ctx.db.select().from(crmDeals).where(target(crmDeals, id));
    if (!deal) throw new AccessDeniedError();
    if (deal.version !== version)
      throw new ConflictError("The deal changed. Reload and try again.");
    if (deal.archivedAt) throw new ValidationError("Restore the deal first.");
    return deal;
  }
  return {
    ...crmManagementRepository(context),
    home: (today: string) => homeDeals(context, today),
    activity: (id: string, options?: Parameters<typeof listCrmActivity>[2]) =>
      listCrmActivity(context, id, options),
    assignOwner: (id: string, input: Parameters<typeof assignOwner>[2]) =>
      assignOwner(context, id, input),
    ...crmSharing(context),
    timeline: (id: string, options?: Parameters<typeof timeline>[2]) =>
      timeline(context, id, options),
    ...settingsRepository(context),
    createFollowUp: (input: Parameters<typeof createFollowUp>[1]) => createFollowUp(context, input),
    followUps: (id: string) => followUps(context, id),
    async configureStages(stages: { id?: string; name: string }[]) {
      const value = parseInput(
        crmWrite.options.find((option) => option.shape.action.value === "configureStages")!,
        { organizationId: org, action: "configureStages", stages },
      );
      if (value.action !== "configureStages") throw new ValidationError("Invalid stages.");
      const ids = stages.flatMap((stage) => (stage.id ? [stage.id] : []));
      if (new Set(ids).size !== ids.length) throw new ValidationError("Stage IDs must be unique.");
      return context.transaction(async (ctx) => {
        await requireHumanCrmAdmin(ctx);
        await ctx.db.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`crm-pipeline:${org}`}, 0))`,
        );
        const existing = await ctx.db
          .select()
          .from(crmStages)
          .where(eq(crmStages.organizationId, org))
          .for("update");
        if (ids.some((id) => !existing.some((stage) => stage.id === id)))
          throw new ValidationError("Unknown stage.");
        const removed = existing.flatMap((stage) => (ids.includes(stage.id) ? [] : [stage.id]));
        if (removed.length) {
          const [used] = await ctx.db
            .select({ id: crmDeals.entityId })
            .from(crmDeals)
            .where(
              and(
                eq(crmDeals.organizationId, org),
                inArray(crmDeals.stageId, removed),
                eq(crmDeals.outcome, "open"),
              ),
            )
            .limit(1);
          if (used) throw new ConflictError("Move open deals before retiring a stage.");
          await ctx.db
            .update(crmStages)
            .set({ retired: true })
            .where(and(eq(crmStages.organizationId, org), inArray(crmStages.id, removed)));
        }
        const positioned = stages.map((stage, position) => ({ ...stage, position }));
        const kept = positioned.filter((stage) => stage.id);
        // No unique constraint covers position, so one statement can renumber every kept stage.
        if (kept.length)
          await ctx.db.execute(sql`update ${crmStages}
            set name = v.name, position = v.position, retired = false
            from (values ${sql.join(
              kept.map(
                (stage) =>
                  sql`(${stage.id}::uuid, ${stage.name}::text, ${stage.position}::integer)`,
              ),
              sql`, `,
            )}) as v(id, name, position)
            where ${crmStages.organizationId} = ${org} and ${crmStages.id} = v.id`);
        const added = positioned.filter((stage) => !stage.id);
        if (added.length)
          await ctx.db.insert(crmStages).values(
            added.map((stage) => ({
              organizationId: org,
              name: stage.name,
              position: stage.position,
            })),
          );
        return ctx.db
          .select()
          .from(crmStages)
          .where(eq(crmStages.organizationId, org))
          .orderBy(asc(crmStages.position));
      });
    },
    report: (from: Date, to: Date, options?: Parameters<typeof report>[3]) =>
      report(context, from, to, options),
    reportDeals: (input: Parameters<typeof reportDeals>[1]) => reportDeals(context, input),
    async listAccounts(options: ListOptions = {}) {
      await requireAppEnabled(context, "crm", false);
      await context.requireActiveActor();
      return db
        .select()
        .from(crmAccounts)
        .where(listWhere(crmAccounts, options))
        .orderBy(asc(crmAccounts.entityId))
        .limit(pageSize(options.limit));
    },
    async createAccount(input: z.input<typeof accountFields> & { requestId?: string }) {
      const value = parseInput(accountFields, input);
      return createOnce(
        context,
        "account",
        input.requestId,
        value,
        async (ctx) => {
          const ownerActorEntityId = await owner(ctx);
          const entity = await ctx.createEntity("account");
          const [row] = await ctx.db
            .insert(crmAccounts)
            .values({
              ...value,
              entityType: "account",
              entityId: entity.entityId,
              organizationId: org,
              ownerActorEntityId,
            })
            .returning();
          changed(ctx, entity.entityId);
          await recordCrmActivity(ctx, { entityId: entity.entityId, action: "created" });
          return row!;
        },
        async (ctx, id) => (await crmRepository(ctx).getAccount(id)).account,
      );
    },
    async updateAccount(id: string, input: z.input<typeof accountFields>) {
      const value = parseInput(accountFields, input);
      return context.transaction(async (ctx) => {
        await requireType(ctx, id, "account", true);
        const [previous] = await ctx.db.select().from(crmAccounts).where(target(crmAccounts, id));
        if (!previous) throw new AccessDeniedError();
        const changedFields = (["name", "website", "domain", "summary"] as const).filter(
          (key) => previous[key] !== value[key],
        );
        const [row] = await ctx.db
          .update(crmAccounts)
          .set(value)
          .where(target(crmAccounts, id))
          .returning();
        await ctx.touch(id);
        changed(ctx, id);
        if (changedFields.length)
          await recordCrmActivity(ctx, { entityId: id, action: "updated", changedFields });
        return row!;
      });
    },
    async getAccount(id: string) {
      const access = await requireType(context, id, "account");
      const [account] = await db.select().from(crmAccounts).where(target(crmAccounts, id));
      if (!account) throw new AccessDeniedError();
      const people = await db
        .select({ contact: contacts, affiliation: crmAffiliations })
        .from(crmAffiliations)
        .innerJoin(
          contacts,
          and(
            eq(contacts.organizationId, crmAffiliations.organizationId),
            eq(contacts.entityId, crmAffiliations.contactEntityId),
          ),
        )
        .where(
          and(
            eq(crmAffiliations.organizationId, org),
            eq(crmAffiliations.accountEntityId, id),
            context.readable(contacts.entityId),
          ),
        )
        .orderBy(asc(contacts.entityId));
      const deals = await db
        .select()
        .from(crmDeals)
        .where(
          and(
            eq(crmDeals.organizationId, org),
            eq(crmDeals.accountEntityId, id),
            context.readable(crmDeals.entityId),
          ),
        )
        .orderBy(asc(crmDeals.entityId))
        .limit(100);
      return { account, level: access.level, contacts: people, deals };
    },
    async setAffiliation(input: {
      contactEntityId: string;
      accountEntityId: string;
      title: string;
      isPrimary: boolean;
    }) {
      return context.transaction(async (ctx) => {
        await requireAffiliationAccess(ctx, input.contactEntityId, input.accountEntityId);
        const [archive] = await ctx.db.execute<{ contact: Date | null; account: Date | null }>(sql`
          select (select ${crmContactProfiles.archivedAt}
            from ${crmContactProfiles}
            where ${crmContactProfiles.organizationId} = ${org}
              and ${crmContactProfiles.contactEntityId} = ${input.contactEntityId}) as contact,
            (select ${crmAccounts.archivedAt}
            from ${crmAccounts}
            where ${crmAccounts.organizationId} = ${org}
              and ${crmAccounts.entityId} = ${input.accountEntityId}) as account
        `);
        if (archive?.contact || archive?.account)
          throw new ValidationError("Restore the archived record first.");
        const [previous] = await ctx.db
          .select()
          .from(crmAffiliations)
          .where(
            and(
              eq(crmAffiliations.organizationId, org),
              eq(crmAffiliations.contactEntityId, input.contactEntityId),
              eq(crmAffiliations.accountEntityId, input.accountEntityId),
            ),
          );
        if (input.isPrimary)
          await ctx.db
            .update(crmAffiliations)
            .set({ isPrimary: false })
            .where(
              and(
                eq(crmAffiliations.organizationId, org),
                eq(crmAffiliations.contactEntityId, input.contactEntityId),
                eq(crmAffiliations.isPrimary, true),
                ne(crmAffiliations.accountEntityId, input.accountEntityId),
              ),
            );
        const [row] = await ctx.db
          .insert(crmAffiliations)
          .values({ organizationId: org, ...input })
          .onConflictDoUpdate({
            target: [
              crmAffiliations.organizationId,
              crmAffiliations.contactEntityId,
              crmAffiliations.accountEntityId,
            ],
            set: { title: input.title, isPrimary: input.isPrimary },
          })
          .returning();
        changed(ctx, input.contactEntityId);
        changed(ctx, input.accountEntityId);
        if (!previous || previous.title !== input.title || previous.isPrimary !== input.isPrimary) {
          await recordCrmActivities(ctx, [
            {
              entityId: input.contactEntityId,
              action: previous ? "updated" : "context_linked",
              changedFields: ["affiliation"],
              relatedEntityId: input.accountEntityId,
            },
            {
              entityId: input.accountEntityId,
              action: previous ? "updated" : "context_linked",
              changedFields: ["affiliation"],
              relatedEntityId: input.contactEntityId,
            },
          ]);
        }
        return row!;
      });
    },
    async removeAffiliation(contactId: string, accountId: string) {
      return context.transaction(async (ctx) => {
        await requireAffiliationAccess(ctx, contactId, accountId);
        const removed = await ctx.db
          .delete(crmAffiliations)
          .where(
            and(
              eq(crmAffiliations.organizationId, org),
              eq(crmAffiliations.contactEntityId, contactId),
              eq(crmAffiliations.accountEntityId, accountId),
            ),
          )
          .returning({ id: crmAffiliations.id });
        changed(ctx, contactId);
        changed(ctx, accountId);
        if (removed.length) {
          await recordCrmActivities(ctx, [
            {
              entityId: contactId,
              action: "context_unlinked",
              changedFields: ["affiliation"],
              relatedEntityId: accountId,
            },
            {
              entityId: accountId,
              action: "context_unlinked",
              changedFields: ["affiliation"],
              relatedEntityId: contactId,
            },
          ]);
        }
      });
    },
    async pipeline() {
      await requireAppEnabled(context, "crm", false);
      await context.requireActiveActor();
      return db
        .select()
        .from(crmStages)
        .where(eq(crmStages.organizationId, org))
        .orderBy(asc(crmStages.position), asc(crmStages.id));
    },
    async ensurePipeline() {
      return context.transaction(async (ctx) => {
        await requireAppEnabled(ctx, "crm");
        await ctx.requireActiveActor();
        await ctx.db.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`crm-pipeline:${org}`}, 0))`,
        );
        const rows = await ctx.db
          .select()
          .from(crmStages)
          .where(eq(crmStages.organizationId, org))
          .orderBy(asc(crmStages.position));
        if (rows.length) return rows;
        return ctx.db
          .insert(crmStages)
          .values(
            ["Qualification", "Discovery", "Proposal", "Negotiation"].map((name, position) => ({
              organizationId: org,
              name,
              position,
            })),
          )
          .returning();
      });
    },
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
          await participants(ctx, entity.entityId, value);
          changed(ctx, entity.entityId);
          await recordCrmActivity(ctx, { entityId: entity.entityId, action: "created" });
          return row!;
        },
        async (ctx, id) => (await crmRepository(ctx).getDeal(id)).deal,
      );
    },
    async updateDeal(id: string, expectedVersion: number, input: DealInput) {
      const value = parseInput(dealFields, input);
      return context.transaction(async (ctx) => {
        const previous = await lockedDeal(ctx, id, expectedVersion);
        if (previous.stageId !== value.stageId)
          throw new ValidationError("Use a stage transition to change stage.");
        const retained = await ctx.db
          .select({
            contactEntityId: crmDealContacts.contactEntityId,
            isPrimary: crmDealContacts.isPrimary,
          })
          .from(crmDealContacts)
          .where(
            and(
              eq(crmDealContacts.organizationId, org),
              eq(crmDealContacts.dealEntityId, id),
              sql`NOT ${ctx.readable(crmDealContacts.contactEntityId)}`,
            ),
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
        const priorParticipants = await ctx.db
          .select({
            contactEntityId: crmDealContacts.contactEntityId,
            isPrimary: crmDealContacts.isPrimary,
          })
          .from(crmDealContacts)
          .where(
            and(eq(crmDealContacts.organizationId, org), eq(crmDealContacts.dealEntityId, id)),
          );
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
        const [row] = await ctx.db
          .update(crmDeals)
          .set({
            ...fields,
            accountEntityId: retainedAccountId ?? fields.accountEntityId,
            version: previous.version + 1,
          })
          .where(target(crmDeals, id))
          .returning();
        await participants(ctx, id, value, retained);
        await ctx.touch(id);
        changed(ctx, id);
        if (changedFields.length)
          await recordCrmActivity(ctx, { entityId: id, action: "updated", changedFields });
        return presentDeal(ctx, row!);
      });
    },
    async transitionDeal(
      id: string,
      input: Omit<Transition, "action" | "organizationId" | "entityId">,
    ) {
      return context.transaction(async (ctx) => {
        await requireType(ctx, id, "deal", true);
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
        const previous = await lockedDeal(ctx, id, input.expectedVersion);
        await requireStage(ctx, input.stageId);
        const now = new Date();
        let closedAt = previous.outcome === input.outcome ? previous.closedAt : now;
        if (input.outcome === "open") closedAt = null;
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
          .where(target(crmDeals, id))
          .returning();
        await recordRequest(ctx, "deal_transition", input.requestId, fingerprint, id);
        await ctx.touch(id);
        changed(ctx, id);
        const changedFields: NonNullable<CrmActivityInput["changedFields"]> = [];
        if (previous.stageId !== input.stageId) changedFields.push("stage");
        if (previous.outcome !== input.outcome) changedFields.push("outcome");
        if (previous.lostReason !== row!.lostReason) changedFields.push("lostReason");
        if (changedFields.length)
          await recordCrmActivity(ctx, { entityId: id, action: "stage_changed", changedFields });
        return presentDeal(ctx, row!);
      });
    },
    async listDeals(options: ListOptions = {}) {
      await requireAppEnabled(context, "crm", false);
      await context.requireActiveActor();
      const rows = await db
        .select()
        .from(crmDeals)
        .where(listWhere(crmDeals, options))
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
            context.readable(contacts.entityId),
          ),
        );
      return {
        deal: { ...raw, accountEntityId: account?.entityId ?? null },
        account: account ?? null,
        contacts: people,
        level: access.level,
      };
    },
    async archive(id: string, archived: boolean) {
      return context.transaction(async (ctx) => {
        const { entity } = await ctx.requireAccess(id, "edit", true);
        let previousArchived = false;
        if (entity.entityType === "account" || entity.entityType === "deal") {
          const table = entity.entityType === "account" ? crmAccounts : crmDeals;
          const [previous] = await ctx.db
            .select({ archivedAt: table.archivedAt })
            .from(table)
            .where(target(table, id));
          previousArchived = !!previous?.archivedAt;
        }
        const archivedAt = archived ? new Date() : null;
        if (entity.entityType === "account")
          await ctx.db.update(crmAccounts).set({ archivedAt }).where(target(crmAccounts, id));
        else if (entity.entityType === "deal")
          await ctx.db
            .update(crmDeals)
            .set({ archivedAt, version: sql`${crmDeals.version} + 1` })
            .where(target(crmDeals, id));
        else throw new ValidationError("This record cannot be archived in CRM.");
        await ctx.touch(id);
        changed(ctx, id);
        if (previousArchived !== archived)
          await recordCrmActivity(ctx, {
            entityId: id,
            action: archived ? "archived" : "restored",
          });
      });
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
