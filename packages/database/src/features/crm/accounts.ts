import { accountFields } from "@substrate/contracts/crm/input";

import { requireAppEnabledForActiveActor } from "../../core/apps/access";
import { contactReadable } from "../../core/contacts/access";
import { parseInput } from "../../core/contacts/inputs";
import { contacts } from "../../core/contacts/schema";
import { RepositoryContext, pageSize } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { recordCrmActivity } from "./activity";
import { createOnce } from "./creation";
import { crmRecordAccess, type ListOptions } from "./record-access";
import { crmAccounts, crmAffiliations, crmDeals } from "./schema";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

export function crmAccountsRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const org = scope.organizationId;
  const { changed, target, requireType, owner, listWhere } = crmRecordAccess(context);
  return {
    async listAccounts(options: ListOptions = {}) {
      await requireAppEnabledForActiveActor(context, "crm");
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
        async (ctx, id) => (await crmAccountsRepository(ctx).getAccount(id)).account,
      );
    },
    async updateAccount(id: string, input: z.input<typeof accountFields>) {
      const value = parseInput(accountFields, input);
      return context.transaction(async (ctx) => {
        const access = await requireType(ctx, id, "account", true);
        const [previous] = await ctx.db.select().from(crmAccounts).where(target(crmAccounts, id));
        if (!previous) throw new AccessDeniedError();
        const changedFields = (["name", "website", "domain", "summary"] as const).filter(
          (key) => previous[key] !== value[key],
        );
        // Reassignment writes the entity before the CRM row. Use that order for CRM edits too.
        await ctx.touch(id);
        const [row] = await ctx.db
          .update(crmAccounts)
          .set(value)
          .where(target(crmAccounts, id))
          .returning();
        changed(ctx, id);
        if (changedFields.length)
          await recordCrmActivity(ctx, { entityId: id, action: "updated", changedFields }, access);
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
            contactReadable(context, contacts.entityId),
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
  };
}
