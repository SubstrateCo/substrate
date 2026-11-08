import type { McpInput } from "@startup-os/contracts/harness/tools";

import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { requireWork } from "../context/access";
import { messageEntityReferences } from "../context/schema";
import { requireMessage, visibleConversations, type MessagingIdentity } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { projects } from "../projects/schema";
import { tasks } from "../tasks/tasks.schema";
import { pagination } from "./pagination";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

export async function relatedContext(
  ctx: RepositoryContext,
  identity: MessagingIdentity,
  input: McpInput<"get_related_context">,
) {
  const { db, scope } = ctx;
  const p = pagination(scope, "get_related_context", input);
  if (input.target.type === "message") {
    const { message, conversation } = await requireMessage(db, identity, input.target.messageId);
    if (
      message.conversationId !== input.target.conversationId ||
      conversation.organizationId !== scope.organizationId
    )
      throw new AccessDeniedError();
    const rows = await db
      .select({
        id: messageEntityReferences.entityId,
        type: sql<"task" | "project">`${messageEntityReferences.entityType}`,
        relationship: sql<
          "source" | "reference"
        >`case when ${messageEntityReferences.purpose} = 'source' then 'source' else 'reference' end`,
        label: sql<string>`coalesce(${tasks.title}, ${projects.name})`,
      })
      .from(messageEntityReferences)
      .leftJoin(tasks, eq(tasks.entityId, messageEntityReferences.entityId))
      .leftJoin(projects, eq(projects.entityId, messageEntityReferences.entityId))
      .where(
        and(
          eq(messageEntityReferences.messageId, input.target.messageId),
          eq(messageEntityReferences.organizationId, scope.organizationId),
          inArray(messageEntityReferences.entityId, ctx.readableEntities()),
          sql`(${tasks.entityId} is null or ${tasks.projectEntityId} in ${ctx.readableEntities()})`,
        ),
      )
      .orderBy(asc(messageEntityReferences.entityId), asc(messageEntityReferences.purpose))
      .offset(p.offset)
      .limit(p.take);
    return p.page(rows.map(({ id, type, ...rest }) => ({ ...rest, target: { type, id } })));
  }
  const work = await requireWork(ctx, input.target.id);
  if (work.entityType !== input.target.type) throw new AccessDeniedError();
  // Combine structural relationships and contextual references before pagination.
  const rows = await db.execute<{
    target:
      | { type: "task" | "project"; id: string }
      | { type: "message"; conversationId: string; messageId: string };
    relationship: "parent" | "child" | "source" | "reference";
    label: string;
  }>(sql`
    SELECT target, relationship, label FROM (
      SELECT jsonb_build_object('type', 'message', 'conversationId', m.conversation_id, 'messageId', m.id) AS target,
        CASE WHEN r.purpose = 'source' THEN 'source' ELSE 'reference' END AS relationship,
        left(m.body, 160) AS label, m.id::text AS sort_id, r.purpose::text AS sort_kind
      FROM ${messageEntityReferences} r
      JOIN ${messagingMessages} m ON m.id = r.message_id
      JOIN ${messagingConversations} ON ${messagingConversations.id} = m.conversation_id
      WHERE r.organization_id = ${scope.organizationId} AND r.entity_id = ${input.target.id} AND ${visibleConversations(db, identity)}
      UNION ALL
      SELECT jsonb_build_object('type', 'task', 'id', t.entity_id), 'child', t.title, t.entity_id::text, 'child'
      FROM ${tasks} t WHERE t.organization_id = ${scope.organizationId}
        AND ${input.target.type === "project" ? sql`t.project_entity_id = ${input.target.id} AND t.parent_task_entity_id IS NULL` : sql`t.parent_task_entity_id = ${input.target.id}`}
        AND t.entity_id IN ${ctx.readableEntities()}
      UNION ALL
      SELECT jsonb_build_object('type', 'project', 'id', p.entity_id), 'parent', p.name, p.entity_id::text, 'parent'
      FROM ${tasks} t JOIN ${projects} p ON p.entity_id = t.project_entity_id
      WHERE t.entity_id = ${input.target.id} AND t.parent_task_entity_id IS NULL AND p.entity_id IN ${ctx.readableEntities()}
      UNION ALL
      SELECT jsonb_build_object('type', 'task', 'id', parent.entity_id), 'parent', parent.title, parent.entity_id::text, 'parent'
      FROM ${tasks} t JOIN ${tasks} parent ON parent.entity_id = t.parent_task_entity_id
      WHERE t.entity_id = ${input.target.id} AND parent.entity_id IN ${ctx.readableEntities()}
    ) related ORDER BY sort_id, sort_kind OFFSET ${p.offset} LIMIT ${p.take}
  `);
  return p.page([...rows]);
}
