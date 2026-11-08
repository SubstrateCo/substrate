import { actors } from "../../core/actors/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { notifications } from "../notifications/schema";
import { taskActivity } from "./schema";
import { sql } from "drizzle-orm";

export async function recordTaskActivity(
  context: RepositoryContext,
  taskEntityId: string,
  action: string,
  sourceMessageId?: string,
) {
  const [event] = await context.db
    .insert(taskActivity)
    .values({
      organizationId: context.scope.organizationId,
      taskEntityId,
      actorEntityId: context.scope.actorEntityId,
      action,
      sourceMessageId,
    })
    .returning();
  return event!;
}

export async function recordTaskActivities(
  context: RepositoryContext,
  taskEntityId: string,
  actions: string[],
) {
  if (!actions.length) return [];
  return context.db
    .insert(taskActivity)
    .values(
      actions.map((action) => ({
        organizationId: context.scope.organizationId,
        taskEntityId,
        actorEntityId: context.scope.actorEntityId,
        action,
      })),
    )
    .returning();
}

export async function notifyAssignment(
  context: RepositoryContext,
  taskEntityId: string,
  recipient: string | null | undefined,
  eventKey: string,
) {
  if (!recipient || recipient === context.scope.actorEntityId) return;
  const { organizationId } = context.scope;
  // Only human actors in this workspace receive assignment notifications.
  await context.db.execute(sql`
    INSERT INTO ${notifications} (organization_id, recipient_actor_entity_id, kind, entity_id, event_key)
    SELECT ${actors.organizationId}, ${actors.entityId}, 'assignment', ${taskEntityId}::uuid, ${eventKey}
    FROM ${actors}
    WHERE ${actors.entityId} = ${recipient}::uuid AND ${actors.organizationId} = ${organizationId}
      AND ${actors.type} = 'human'
    ON CONFLICT DO NOTHING
  `);
}
