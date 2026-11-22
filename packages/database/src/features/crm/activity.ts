import {
  crmActivityInput,
  crmActivityOptions,
  type CrmActivity,
  type CrmActivityInput,
  type CrmActivityOptions,
  type CrmActivityPage,
} from "@substrate/contracts/crm/activity";

import { actors } from "../../core/actors/schema";
import { requireAppEnabled } from "../../core/apps/access";
import { user } from "../../core/authentication/schema";
import { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { crmActivityEvents } from "./activity.schema";
import { crmActorView, joinCrmActorPerson } from "./actor-views";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

// Call only inside a domain-authorized mutation transaction. Never expose an append API.
export async function recordCrmActivity(ctx: RepositoryContext, input: CrmActivityInput) {
  const [event] = await recordCrmActivities(ctx, [input]);
  return event!;
}

// Same rules as recordCrmActivity, with one access lookup and one insert for all inputs.
export async function recordCrmActivities(ctx: RepositoryContext, inputs: CrmActivityInput[]) {
  const values = inputs.map((input) => {
    const parsed = crmActivityInput.safeParse(input);
    if (!parsed.success) throw new ValidationError("Invalid CRM activity.");
    return parsed.data;
  });
  if (!values.length) return [];
  const ids = [
    ...new Set(
      values.flatMap((value) =>
        value.relatedEntityId ? [value.entityId, value.relatedEntityId] : [value.entityId],
      ),
    ),
  ];
  const readable = await ctx.requireAccessAll(ids, "view");
  const types = new Map(readable.map(({ entity }) => [entity.entityId, entity.entityType]));
  const rows = values.map((value) => {
    const entityType = types.get(value.entityId);
    if (!entityType) throw new AccessDeniedError();
    if (entityType !== "account" && entityType !== "contact" && entityType !== "deal")
      throw new ValidationError("Choose a CRM record.");
    if (value.relatedEntityId && !types.has(value.relatedEntityId)) throw new AccessDeniedError();
    return {
      organizationId: ctx.scope.organizationId,
      entityId: value.entityId,
      entityType,
      actorEntityId: ctx.scope.actorEntityId,
      action: value.action,
      changedFields: [...new Set(value.changedFields ?? [])].sort((left, right) =>
        left.localeCompare(right),
      ),
      relatedEntityId: value.relatedEntityId,
    };
  });
  return ctx.db.insert(crmActivityEvents).values(rows).returning({ id: crmActivityEvents.id });
}

export async function listCrmActivity(
  ctx: RepositoryContext,
  entityId: string,
  options: CrmActivityOptions = {},
): Promise<CrmActivityPage> {
  await requireAppEnabled(ctx, "crm", false);
  const parsed = crmActivityOptions.safeParse(options);
  if (!parsed.success) throw new ValidationError("Invalid CRM activity cursor or limit.");
  const { entity } = await ctx.requireAccess(entityId, "view");
  if (!["account", "contact", "deal"].includes(entity.entityType))
    throw new ValidationError("Choose a CRM record.");
  const { before, limit = 50 } = parsed.data;
  const events = ctx.db
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
    .$dynamic();
  const rows = await joinCrmActorPerson(events)
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
        actor: crmActorView(row.actorType, row.personName),
      };
      if (row.relatedEntityId) item.relatedEntityId = row.relatedEntityId;
      return item;
    }),
    nextCursor:
      rows.length > limit && last ? { createdAt: last.cursorCreatedAt, id: last.id } : null,
  };
}
