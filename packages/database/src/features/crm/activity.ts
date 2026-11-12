import {
  crmActivityInput,
  crmActivityOptions,
  type CrmActivity,
  type CrmActivityInput,
  type CrmActivityOptions,
  type CrmActivityPage,
} from "@substrate/contracts/crm/activity";

import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { RepositoryContext } from "../../core/repository-context";
import { ValidationError } from "../../errors";
import { crmActivityEvents } from "./activity.schema";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// Call only inside a domain-authorized mutation transaction. Never expose an append API.
export async function recordCrmActivity(ctx: RepositoryContext, input: CrmActivityInput) {
  const parsed = crmActivityInput.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid CRM activity.");
  const value = parsed.data;
  await ctx.requireActiveActor();
  const { entity } = await ctx.requireAccess(value.entityId, "view");
  if (!["account", "contact", "deal"].includes(entity.entityType))
    throw new ValidationError("Choose a CRM record.");
  if (value.relatedEntityId) await ctx.requireAccess(value.relatedEntityId, "view");
  const [event] = await ctx.db
    .insert(crmActivityEvents)
    .values({
      organizationId: ctx.scope.organizationId,
      entityId: value.entityId,
      entityType: entity.entityType,
      actorEntityId: ctx.scope.actorEntityId,
      action: value.action,
      changedFields: [...new Set(value.changedFields ?? [])].sort((left, right) =>
        left.localeCompare(right),
      ),
      relatedEntityId: value.relatedEntityId,
    })
    .returning({ id: crmActivityEvents.id });
  return event!;
}

export async function listCrmActivity(
  ctx: RepositoryContext,
  entityId: string,
  options: CrmActivityOptions = {},
): Promise<CrmActivityPage> {
  const parsed = crmActivityOptions.safeParse(options);
  if (!parsed.success) throw new ValidationError("Invalid CRM activity cursor or limit.");
  const { entity } = await ctx.requireAccess(entityId, "view");
  if (!["account", "contact", "deal"].includes(entity.entityType))
    throw new ValidationError("Choose a CRM record.");
  const { before, limit = 50 } = parsed.data;
  const person = alias(actors, "crm_activity_person");
  const rows = await ctx.db
    .select({
      id: crmActivityEvents.id,
      entityId: crmActivityEvents.entityId,
      action: crmActivityEvents.action,
      changedFields: crmActivityEvents.changedFields,
      relatedEntityId: crmActivityEvents.relatedEntityId,
      createdAt: crmActivityEvents.createdAt,
      cursorCreatedAt: sql<string>`to_char(${crmActivityEvents.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      actorType: actors.type,
      personName: user.name,
    })
    .from(crmActivityEvents)
    .innerJoin(
      actors,
      and(
        eq(actors.organizationId, crmActivityEvents.organizationId),
        eq(actors.entityId, crmActivityEvents.actorEntityId),
      ),
    )
    .leftJoin(userAgents, and(eq(actors.type, "agent"), eq(userAgents.id, actors.userAgentId)))
    .leftJoin(
      person,
      and(
        eq(person.organizationId, actors.organizationId),
        eq(person.type, "human"),
        eq(person.userId, sql`coalesce(${actors.userId}, ${userAgents.userId})`),
      ),
    )
    .leftJoin(user, eq(user.id, person.userId))
    .where(
      and(
        eq(crmActivityEvents.organizationId, ctx.scope.organizationId),
        eq(crmActivityEvents.entityId, entityId),
        ctx.readable(crmActivityEvents.entityId),
        or(
          isNull(crmActivityEvents.relatedEntityId),
          ctx.readable(crmActivityEvents.relatedEntityId),
        ),
        before
          ? sql`(${crmActivityEvents.createdAt}, ${crmActivityEvents.id}) < (${before.createdAt}::timestamptz, ${before.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(crmActivityEvents.createdAt), desc(crmActivityEvents.id))
    .limit(limit + 1);
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  return {
    items: visible.map((row) => {
      const item: CrmActivity = {
        id: row.id,
        entityId: row.entityId,
        action: row.action,
        changedFields: row.changedFields,
        createdAt: row.createdAt.toISOString(),
        actor: {
          type: row.actorType,
          displayName:
            row.actorType === "agent"
              ? `Agent on behalf of ${row.personName ?? "a former member"}`
              : (row.personName ?? "Former member"),
        },
      };
      if (row.relatedEntityId) item.relatedEntityId = row.relatedEntityId;
      return item;
    }),
    nextCursor:
      rows.length > limit && last ? { createdAt: last.cursorCreatedAt, id: last.id } : null,
  };
}
