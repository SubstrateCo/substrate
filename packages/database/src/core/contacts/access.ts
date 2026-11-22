import { AccessDeniedError } from "../../errors";
import { activeActorCondition, permissionActorEntityId } from "../actors/access";
import { actors } from "../actors/schema";
import { entities } from "../entities/schema";
import { organizationAdminCondition } from "../permissions/visibility";
import type { EntityAccess, LockedAccess, RepositoryContext } from "../repository-context";
import { contactInteractions } from "./interactions.schema";
import { and, eq, inArray, isNull, sql, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// Contacts belong to the whole organization. Every active member reads and edits every contact and
// its interactions, so contacts have no grants. Authors delete their own interactions, and admins
// delete any. An agent acts as its owner.

function activeMember(ctx: RepositoryContext) {
  const { scope } = ctx;
  return sql`EXISTS (
    SELECT 1 FROM ${actors}
    JOIN ${entities} contact_actor_entity ON contact_actor_entity.organization_id = ${actors.organizationId}
      AND contact_actor_entity.entity_id = ${actors.entityId} AND contact_actor_entity.deleted_at IS NULL
    WHERE ${actors.organizationId} = ${scope.organizationId} AND ${actors.entityId} = ${scope.actorEntityId}::uuid
      AND ${activeActorCondition()}
  )`;
}

async function contactAccess(ctx: RepositoryContext, id: string, lock: boolean) {
  const query = ctx.db
    .select({
      entity: entities,
      admin: sql<boolean>`${organizationAdminCondition(ctx.scope)}`,
    })
    .from(entities)
    .where(
      and(
        eq(entities.organizationId, ctx.scope.organizationId),
        eq(entities.entityId, id),
        eq(entities.entityType, "contact"),
        isNull(entities.deletedAt),
        activeMember(ctx),
      ),
    );
  const [row] = lock ? await query.for("no key update") : await query;
  if (!row) throw new AccessDeniedError();
  return { entity: row.entity, level: row.admin ? "owner" : "edit" } satisfies EntityAccess;
}

/** The live contact, for any active member of its organization. */
export function requireContact(ctx: RepositoryContext, id: string): Promise<EntityAccess> {
  return contactAccess(ctx, id, false);
}

/** requireContact, holding the contact's row lock until the transaction ends. Writes to a contact
 * and its interactions take this lock, so they run one at a time. */
export async function lockContact(
  ctx: RepositoryContext,
  id: string,
): Promise<LockedAccess<"edit">> {
  // SAFETY: the row is locked in this transaction, which is what LockedAccess records.
  return (await contactAccess(ctx, id, true)) as LockedAccess<"edit">;
}

/** List filter: the contact in `entityId` is live and the actor is an active member. */
export function contactReadable(ctx: RepositoryContext, entityId: SQLWrapper) {
  return sql`(${activeMember(ctx)} AND EXISTS (
    SELECT 1 FROM ${entities} readable_contact
    WHERE readable_contact.organization_id = ${ctx.scope.organizationId}
      AND readable_contact.entity_id = ${entityId}
      AND readable_contact.entity_type = 'contact' AND readable_contact.deleted_at IS NULL
  ))`;
}

/** List filter: the interaction in `entityId` and its contact are live, and the actor is an
 * active member. */
export function interactionReadable(ctx: RepositoryContext, entityId: SQLWrapper) {
  return sql`(${activeMember(ctx)} AND EXISTS (
    SELECT 1 FROM ${entities} readable_interaction
    JOIN ${entities} readable_interaction_contact
      ON readable_interaction_contact.organization_id = readable_interaction.organization_id
      AND readable_interaction_contact.entity_id = readable_interaction.access_entity_id
      AND readable_interaction_contact.entity_type = 'contact'
      AND readable_interaction_contact.deleted_at IS NULL
    WHERE readable_interaction.organization_id = ${ctx.scope.organizationId}
      AND readable_interaction.entity_id = ${entityId}
      AND readable_interaction.deleted_at IS NULL
  ))`;
}

async function liveInteraction(ctx: RepositoryContext, id: string) {
  const [row] = await ctx.db
    .select({ interaction: contactInteractions })
    .from(contactInteractions)
    .innerJoin(
      entities,
      and(
        eq(entities.organizationId, contactInteractions.organizationId),
        eq(entities.entityId, contactInteractions.entityId),
        isNull(entities.deletedAt),
      ),
    )
    .where(
      and(
        eq(contactInteractions.organizationId, ctx.scope.organizationId),
        eq(contactInteractions.entityId, id),
      ),
    );
  return row?.interaction;
}

// liveInteraction and requireContact in one statement.
async function interactionAccess(ctx: RepositoryContext, id: string) {
  const contact = alias(entities, "interaction_contact");
  const [row] = await ctx.db
    .select({
      interaction: contactInteractions,
      contact,
      admin: sql<boolean>`${organizationAdminCondition(ctx.scope)}`,
    })
    .from(contactInteractions)
    .innerJoin(
      entities,
      and(
        eq(entities.organizationId, contactInteractions.organizationId),
        eq(entities.entityId, contactInteractions.entityId),
        isNull(entities.deletedAt),
      ),
    )
    .innerJoin(
      contact,
      and(
        eq(contact.organizationId, contactInteractions.organizationId),
        eq(contact.entityId, contactInteractions.contactEntityId),
        eq(contact.entityType, "contact"),
        isNull(contact.deletedAt),
      ),
    )
    .where(
      and(
        eq(contactInteractions.organizationId, ctx.scope.organizationId),
        eq(contactInteractions.entityId, id),
        activeMember(ctx),
      ),
    );
  if (!row) throw new AccessDeniedError();
  return {
    interaction: row.interaction,
    contact: { entity: row.contact, level: row.admin ? "owner" : "edit" } satisfies EntityAccess,
  };
}

type Interaction = typeof contactInteractions.$inferSelect;

/** The live interaction and its contact. `lock` takes the contact's lock first, then reads the
 * interaction again, so a concurrent delete cannot be missed. */
export async function requireInteraction(
  ctx: RepositoryContext,
  id: string,
  lock: true,
): Promise<{ interaction: Interaction; contact: LockedAccess<"edit"> }>;
export async function requireInteraction(
  ctx: RepositoryContext,
  id: string,
  lock?: boolean,
): Promise<{ interaction: Interaction; contact: EntityAccess }>;
export async function requireInteraction(ctx: RepositoryContext, id: string, lock = false) {
  if (!lock) return interactionAccess(ctx, id);
  const found = await liveInteraction(ctx, id);
  if (!found) throw new AccessDeniedError();
  const contact = await lockContact(ctx, found.contactEntityId);
  const interaction = await liveInteraction(ctx, id);
  if (!interaction) throw new AccessDeniedError();
  return { interaction, contact };
}

/** Whether the actor may delete interactions written by the author in `authorEntityId`. */
export function deletableAuthorCondition(ctx: RepositoryContext, authorEntityId: SQLWrapper) {
  const { scope } = ctx;
  return sql`(${organizationAdminCondition(scope)} OR ${permissionActorEntityId(scope)} = ${permissionActorEntityId(
    { organizationId: scope.organizationId, actorEntityId: authorEntityId },
  )})`;
}

/** The authors, among `authorIds`, whose interactions the actor may delete. */
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
