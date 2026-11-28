import type { RecordArchiveFilter } from "@substrate/contracts/crm/input";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { requireAppEnabled } from "../../core/apps/access";
import { contactProfileInput, parseInput, type ContactInput } from "../../core/contacts/inputs";
import { contactDetailRows } from "../../core/contacts/profile";
import { contactRepository } from "../../core/contacts/repository";
import { contacts } from "../../core/contacts/schema";
import { appEnabledCondition } from "../../core/permissions/app-visibility";
import {
  entityCursor,
  pageSize,
  type PermissionLevel,
  type RepositoryContext,
} from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { recordCrmActivity } from "../crm/activity/activity";
import { crmAccounts, crmAffiliations, crmContactProfiles } from "../crm/schema";
import { mutateContactDetail } from "./contact-detail-actions";
import { and, asc, eq, gt, ilike, isNotNull, isNull, sql } from "drizzle-orm";

export function contactApplicationRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const org = scope.organizationId;
  const crmProfileJoin = and(
    eq(crmContactProfiles.organizationId, contacts.organizationId),
    eq(crmContactProfiles.contactEntityId, contacts.entityId),
    appEnabledCondition(org, "crm"),
  );
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
        const repo = contactRepository(
          ctx,
          await ctx.requireAccess(id, "edit", { type: "contact" }),
        );
        const previous = await repo.get(id);
        // SAFETY: parsing above strips unknown keys; every own key belongs to ContactInput.
        const changedFields = (Object.keys(value) as (keyof typeof value)[]).filter(
          (key) => value[key] !== undefined && value[key] !== previous[key],
        );
        if (!changedFields.length) {
          changed(ctx, previous.entityId);
          return previous;
        }
        const row = await repo.updateChanged(id, value);
        changed(ctx, id);
        if (!row) return repo.get(id);
        await recordCrmActivity(ctx, { entityId: id, action: "updated", changedFields });
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
        .leftJoin(crmContactProfiles, crmProfileJoin)
        .where(
          and(
            eq(contacts.organizationId, org),
            context.readable(contacts.entityId, "view", "contact"),
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
      const [row] = await db
        .select({
          profile: contacts,
          level: sql<PermissionLevel>`${context.accessLevel(contacts.entityId)}`,
          archivedAt: crmContactProfiles.archivedAt,
        })
        .from(contacts)
        .leftJoin(crmContactProfiles, crmProfileJoin)
        .where(
          and(
            eq(contacts.organizationId, org),
            eq(contacts.entityId, id),
            context.readable(contacts.entityId, "view", "contact"),
          ),
        );
      if (!row) throw new AccessDeniedError();
      const rows = contactDetailRows(context, id);
      const [identifiers, addresses, urls] = await Promise.all([
        rows.identifiers(),
        rows.addresses(),
        rows.urls(),
      ]);
      const detail = { profile: row.profile, identifiers, addresses, urls };
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
      return {
        ...detail,
        affiliations,
        archivedAt: row.archivedAt ?? null,
        level: row.level,
      };
    },
    archive(id: string, archived: boolean) {
      return context.transaction(async (ctx) => {
        await requireAppEnabled(ctx, "crm");
        await ctx.requireAccess(id, "edit", { type: "contact" });
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
        const written = await ctx.db
          .insert(crmContactProfiles)
          .values({ organizationId: org, contactEntityId: id, archivedAt })
          .onConflictDoUpdate({
            target: crmContactProfiles.contactEntityId,
            set: { archivedAt },
            setWhere: sql`(${crmContactProfiles.archivedAt} IS NOT NULL) <> ${archived}`,
          })
          .returning({ contactEntityId: crmContactProfiles.contactEntityId });
        await ctx.touch(id);
        changed(ctx, id);
        if (written.length && !!previous?.archivedAt !== archived)
          await recordCrmActivity(ctx, {
            entityId: id,
            action: archived ? "archived" : "restored",
          });
        return { entityId: id };
      });
    },
  };
}
