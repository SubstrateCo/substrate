import { AccessDeniedError } from "../../errors";
import type { RepositoryContext } from "../repository-context";
import { contactAddresses, contactUrls } from "./details.schema";
import { contactIdentifiers, contacts } from "./schema";
import { and, asc, eq } from "drizzle-orm";

/** The contact's profile, in one query that also checks that the actor can read it. */
export async function readContactProfile(ctx: RepositoryContext, contactId: string) {
  const [profile] = await ctx.db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.organizationId, ctx.scope.organizationId),
        eq(contacts.entityId, contactId),
        ctx.readable(contacts.entityId, "view", "contact"),
      ),
    );
  if (!profile) throw new AccessDeniedError();
  return profile;
}

/** Reads of each detail collection of a contact, in ID order. Callers check access first. */
export function contactDetailRows(ctx: RepositoryContext, contactId: string) {
  const owned = (table: typeof contactIdentifiers | typeof contactAddresses | typeof contactUrls) =>
    and(eq(table.organizationId, ctx.scope.organizationId), eq(table.contactEntityId, contactId));
  return {
    identifiers: () =>
      ctx.db
        .select()
        .from(contactIdentifiers)
        .where(owned(contactIdentifiers))
        .orderBy(asc(contactIdentifiers.id)),
    addresses: () =>
      ctx.db
        .select()
        .from(contactAddresses)
        .where(owned(contactAddresses))
        .orderBy(asc(contactAddresses.id)),
    urls: () =>
      ctx.db.select().from(contactUrls).where(owned(contactUrls)).orderBy(asc(contactUrls.id)),
  };
}
