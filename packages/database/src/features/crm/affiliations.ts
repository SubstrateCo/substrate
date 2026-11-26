import { RepositoryContext } from "../../core/repository-context";
import { ValidationError } from "../../errors";
import { crmRecordAccess } from "./access/record-access";
import { recordCrmActivities } from "./activity/activity";
import { crmAccounts, crmAffiliations, crmContactProfiles } from "./schema";
import { and, eq, ne, sql } from "drizzle-orm";

export function crmAffiliationsRepository(context: RepositoryContext) {
  const { scope } = context;
  const org = scope.organizationId;
  const { changed } = crmRecordAccess(context);
  async function requireAffiliationAccess(
    ctx: RepositoryContext,
    contactId: string,
    accountId: string,
  ) {
    // Only the account has grants to check; its access also requires the CRM app.
    await ctx.requireAccess(contactId, "edit", { type: "contact" });
    await ctx.requireAccess(accountId, "edit", { type: "account" });
  }
  return {
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
        // No unique index covers the primary flag. The contact row write orders concurrent
        // primary selections, so the clear below sees the earlier one.
        if (input.isPrimary) await ctx.touch(input.contactEntityId);
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
  };
}
