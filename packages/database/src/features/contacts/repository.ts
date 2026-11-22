import type { RecordArchiveFilter } from "@substrate/contracts/crm/input";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { requireAppEnabled } from "../../core/apps/access";
import { contactReadable, lockContact, requireContact } from "../../core/contacts/access";
import { contactProfileInput, parseInput, type ContactInput } from "../../core/contacts/inputs";
import { contactRepository } from "../../core/contacts/repository";
import { contacts } from "../../core/contacts/schema";
import { appEnabledCondition } from "../../core/permissions/app-visibility";
import { entityCursor, pageSize, type RepositoryContext } from "../../core/repository-context";
import { recordCrmActivity } from "../crm/activity";
import { crmAccounts, crmAffiliations, crmContactProfiles } from "../crm/schema";
import { mutateContactDetail } from "./contact-detail-actions";
import { and, asc, eq, gt, ilike, isNotNull, isNull } from "drizzle-orm";

// Application integration composes the shared contact primitive with its CRM relationships.
export function contactApplicationRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const org = scope.organizationId;
  function changed(ctx: RepositoryContext, id: string) {
    ctx.effects.hint({ audience: realtimeKeys.entity(org, id), domain: "context" });
  }
  return {
    ...contactRepository(context),
    mutateContactDetail: (input: Parameters<typeof mutateContactDetail>[1]) =>
      mutateContactDetail(context, input),
    createContact: (input: ContactInput) =>
      context.transaction(async (ctx) => {
        const row = await contactRepository(ctx).create(input);
        await recordCrmActivity(ctx, { entityId: row.entityId, action: "created" });
        changed(ctx, row.entityId);
        return row;
      }),
    updateContact(id: string, input: Partial<ContactInput>) {
      const value = parseInput(contactProfileInput.partial(), input);
      return context.transaction(async (ctx) => {
        await lockContact(ctx, id);
        const repo = contactRepository(ctx);
        const previous = await repo.get(id);
        // SAFETY: parsing above strips unknown keys; every own key belongs to ContactInput.
        const changedFields = (Object.keys(value) as (keyof typeof value)[]).filter(
          (key) => value[key] !== undefined && value[key] !== previous[key],
        );
        if (!changedFields.length) {
          changed(ctx, previous.entityId);
          return previous;
        }
        const row = await repo.update(id, value);
        await recordCrmActivity(ctx, { entityId: id, action: "updated", changedFields });
        changed(ctx, row.entityId);
        return row;
      });
    },
    async listContacts(
      options: {
        limit?: number;
        afterEntityId?: string;
        search?: string;
        archived?: RecordArchiveFilter;
      } = {},
    ) {
      await context.requireActiveActor();
      const afterEntityId = entityCursor(options.afterEntityId);
      let archiveFilter;
      if (options.archived !== "all")
        archiveFilter =
          options.archived === "archived"
            ? isNotNull(crmContactProfiles.archivedAt)
            : isNull(crmContactProfiles.archivedAt);
      return db
        .select({ contact: contacts, archivedAt: crmContactProfiles.archivedAt })
        .from(contacts)
        .leftJoin(
          crmContactProfiles,
          and(
            eq(crmContactProfiles.organizationId, contacts.organizationId),
            eq(crmContactProfiles.contactEntityId, contacts.entityId),
            appEnabledCondition(org, "crm"),
          ),
        )
        .where(
          and(
            eq(contacts.organizationId, org),
            contactReadable(context, contacts.entityId),
            afterEntityId ? gt(contacts.entityId, afterEntityId) : undefined,
            options.search
              ? ilike(contacts.displayName, `%${options.search.replace(/[\\%_]/g, "\\$&")}%`)
              : undefined,
            archiveFilter,
          ),
        )
        .orderBy(asc(contacts.entityId))
        .limit(pageSize(options.limit));
    },
    async getContact(id: string) {
      const detail = await contactRepository(context).getDetail(id);
      const access = await requireContact(context, id);
      const affiliations = await db
        .select({ affiliation: crmAffiliations, account: crmAccounts })
        .from(crmAffiliations)
        .innerJoin(
          crmAccounts,
          and(
            eq(crmAccounts.organizationId, crmAffiliations.organizationId),
            eq(crmAccounts.entityId, crmAffiliations.accountEntityId),
          ),
        )
        .where(
          and(
            eq(crmAffiliations.organizationId, org),
            eq(crmAffiliations.contactEntityId, id),
            context.readable(crmAccounts.entityId),
          ),
        );
      const [profile] = await db
        .select()
        .from(crmContactProfiles)
        .where(
          and(
            eq(crmContactProfiles.organizationId, org),
            eq(crmContactProfiles.contactEntityId, id),
            appEnabledCondition(org, "crm"),
          ),
        );
      return {
        ...detail,
        affiliations,
        archivedAt: profile?.archivedAt ?? null,
        level: access.level,
      };
    },
    archive(id: string, archived: boolean) {
      return context.transaction(async (ctx) => {
        await requireAppEnabled(ctx, "crm");
        await lockContact(ctx, id);
        const [previous] = await ctx.db
          .select()
          .from(crmContactProfiles)
          .where(
            and(
              eq(crmContactProfiles.organizationId, org),
              eq(crmContactProfiles.contactEntityId, id),
            ),
          );
        const archivedAt = archived ? new Date() : null;
        await ctx.db
          .insert(crmContactProfiles)
          .values({ organizationId: org, contactEntityId: id, archivedAt })
          .onConflictDoUpdate({ target: crmContactProfiles.contactEntityId, set: { archivedAt } });
        await ctx.touch(id);
        changed(ctx, id);
        if (!!previous?.archivedAt !== archived)
          await recordCrmActivity(ctx, {
            entityId: id,
            action: archived ? "archived" : "restored",
          });
        return { entityId: id };
      });
    },
  };
}
