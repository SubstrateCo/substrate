import type { DatabaseExecutor } from "../../client";
import { entities } from "../../core/entities/schema";
import { visibilityCte } from "../../core/permissions/visibility";
import type { RepositoryContext } from "../../core/repository-context";
import { visibleConversations, type MessagingIdentity } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { projects } from "../projects/schema";
import { tasks } from "../tasks/tasks.schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export async function readableWorkTargets(ctx: RepositoryContext, ids: string[]) {
  if (!ids.length)
    return new Map<
      string,
      { entityType: "task" | "project"; title: string; projectEntityId: string }
    >();
  const rows = await ctx.db.execute<{
    entityId: string;
    entityType: "task" | "project";
    title: string;
    projectEntityId: string;
  }>(sql`
    ${visibilityCte(ctx.scope)}
    SELECT ${tasks.entityId} AS "entityId", 'task' AS "entityType", ${tasks.title} AS title,
      ${tasks.projectEntityId} AS "projectEntityId"
    FROM ${tasks}
    JOIN ${entities} e ON e.entity_id = ${tasks.entityId} AND e.organization_id = ${tasks.organizationId}
    JOIN ${entities} p ON p.entity_id = ${tasks.projectEntityId} AND p.organization_id = ${tasks.organizationId}
    WHERE ${tasks.organizationId} = ${ctx.scope.organizationId}
      AND ${inArray(tasks.entityId, ids)} AND e.deleted_at IS NULL AND p.deleted_at IS NULL
      AND e.entity_type = 'task'
      AND ${tasks.entityId} IN (SELECT entity_id FROM visible_entities)
      AND ${tasks.projectEntityId} IN (SELECT entity_id FROM visible_entities)
    UNION ALL
    SELECT ${projects.entityId} AS "entityId", 'project' AS "entityType", ${projects.name} AS title,
      ${projects.entityId} AS "projectEntityId"
    FROM ${projects}
    JOIN ${entities} e ON e.entity_id = ${projects.entityId} AND e.organization_id = ${projects.organizationId}
    WHERE ${projects.organizationId} = ${ctx.scope.organizationId}
      AND ${inArray(projects.entityId, ids)} AND e.deleted_at IS NULL AND e.entity_type = 'project'
      AND ${projects.entityId} IN (SELECT entity_id FROM visible_entities)
  `);
  return new Map(rows.map((row) => [row.entityId, row]));
}

export async function readableMessageTargets(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  ids: string[],
) {
  if (!ids.length) return new Map<string, { id: string; conversationId: string }>();
  const rows = await db
    .select({ id: messagingMessages.id, conversationId: messagingMessages.conversationId })
    .from(messagingMessages)
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, messagingMessages.conversationId),
    )
    .where(and(inArray(messagingMessages.id, ids), visibleConversations(db, scope)));
  return new Map(rows.map((row) => [row.id, row]));
}
