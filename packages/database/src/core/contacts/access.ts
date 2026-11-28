import { AccessDeniedError } from "../../errors";
import { permissionActorEntityId } from "../actors/access";
import { actors } from "../actors/schema";
import { entities } from "../entities/schema";
import { organizationAdminCondition } from "../permissions/visibility";
import type { AuthorizedAccess, RepositoryContext } from "../repository-context";
import { contactInteractions } from "./interactions/interactions.schema";
import { and, eq, inArray, isNull, sql, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export async function requireInteraction(ctx: RepositoryContext, id: string) {
  const access = await ctx.requireAccess(id, "edit", { type: "contact_interaction" });
  const contact = alias(entities, "interaction_contact");
  const [row] = await ctx.db
    .select({ interaction: contactInteractions, contact })
    .from(contactInteractions)
    .innerJoin(
      contact,
      and(
        eq(contact.organizationId, contactInteractions.organizationId),
        eq(contact.entityId, contactInteractions.contactEntityId),
        isNull(contact.deletedAt),
      ),
    )
    .where(
      and(
        eq(contactInteractions.organizationId, ctx.scope.organizationId),
        eq(contactInteractions.entityId, id),
      ),
    );
  if (!row) throw new AccessDeniedError();
  return {
    interaction: row.interaction,
    // SAFETY: the interaction uses its contact's container, so the contact has the same level.
    contact: { entity: row.contact, level: access.level } as AuthorizedAccess<"edit">,
  };
}

export function deletableAuthorCondition(ctx: RepositoryContext, authorEntityId: SQLWrapper) {
  const { scope } = ctx;
  return sql`(${organizationAdminCondition(scope)} OR ${permissionActorEntityId(scope)} = ${permissionActorEntityId(
    { organizationId: scope.organizationId, actorEntityId: authorEntityId },
  )})`;
}

export async function deletableAuthors(ctx: RepositoryContext, authorIds: string[]) {
  const ids = [...new Set(authorIds)];
  if (!ids.length) return new Set<string>();
  const { scope } = ctx;
  const rows = await ctx.db
    .select({ id: actors.entityId })
    .from(actors)
    .where(
      and(
        eq(actors.organizationId, scope.organizationId),
        inArray(actors.entityId, ids),
        deletableAuthorCondition(ctx, actors.entityId),
      ),
    );
  return new Set(rows.map((row) => row.id));
}
