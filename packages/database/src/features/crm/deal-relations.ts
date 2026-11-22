import { contactReadable } from "../../core/contacts/access";
import { contacts } from "../../core/contacts/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { crmAccounts, crmContactProfiles } from "./schema";
import { and, eq, inArray } from "drizzle-orm";

export async function requireDealRelations(
  ctx: RepositoryContext,
  input: { accountEntityId?: string | null; contactEntityIds: string[] },
  options: { active?: boolean } = {},
) {
  const ids = [...new Set(input.contactEntityIds)];
  if (!input.accountEntityId && !ids.length) return;
  await ctx.requireActiveActor();
  if (input.accountEntityId) {
    const [account] = await ctx.db
      .select({ archivedAt: crmAccounts.archivedAt })
      .from(crmAccounts)
      .where(
        and(
          eq(crmAccounts.organizationId, ctx.scope.organizationId),
          eq(crmAccounts.entityId, input.accountEntityId),
          ctx.readable(crmAccounts.entityId),
        ),
      );
    if (!account) throw new AccessDeniedError();
    if (options.active !== false && account.archivedAt)
      throw new ValidationError("Restore the archived record first.");
  }
  if (!ids.length) return;
  const rows = await ctx.db
    .select({ id: contacts.entityId, archivedAt: crmContactProfiles.archivedAt })
    .from(contacts)
    .leftJoin(
      crmContactProfiles,
      and(
        eq(crmContactProfiles.organizationId, contacts.organizationId),
        eq(crmContactProfiles.contactEntityId, contacts.entityId),
      ),
    )
    .where(
      and(
        eq(contacts.organizationId, ctx.scope.organizationId),
        inArray(contacts.entityId, ids),
        contactReadable(ctx, contacts.entityId),
      ),
    );
  if (rows.length !== ids.length) throw new AccessDeniedError();
  if (options.active !== false && rows.some((row) => row.archivedAt))
    throw new ValidationError("Restore the archived record first.");
}
