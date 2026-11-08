import type { WorkspaceApiRequest } from "@startup-os/contracts/harness/mcp";
import { mcpTools, type McpToolName } from "@startup-os/contracts/harness/tools";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { ConflictError, AccessDeniedError } from "../../errors";
import { recordTaskActivity } from "../activity/events";
import { workspaceContext } from "../context/access";
import { messageEntityReferences } from "../context/schema";
import { createContextService } from "../context/service";
import type { MessagingIdentity } from "../messaging/access";
import { requireMessage } from "../messaging/access";
import { createMessagingService } from "../messaging/service";
import { taskRepository } from "../tasks/repository";
import { relatedContext } from "./context";
import { mcpMessagingQueries } from "./messaging";
import { agentToolRequests } from "./schema";
import { mcpTaskQueries, actorSelection } from "./tasks";
import { and, eq } from "drizzle-orm";

export async function executeAgentTool(
  db: DatabaseExecutor,
  identity: MessagingIdentity & { actorEntityId: string },
  tool: McpToolName,
  raw: WorkspaceApiRequest["input"],
) {
  const input = mcpTools[tool].input.parse(raw);
  return db.transaction(async (tx) => {
    const ctx = await workspaceContext(tx, identity);
    const [actor] = await tx
      .select(actorSelection)
      .from(actors)
      .where(eq(actors.entityId, identity.actorEntityId))
      .for("update");
    if (!actor || actor.type !== "agent") throw new AccessDeniedError();
    const tasks = taskRepository(ctx);
    const queries = mcpTaskQueries(ctx, identity);
    const messaging = mcpMessagingQueries(ctx, identity);
    const context = createContextService(tx, identity);
    async function perform() {
      switch (tool) {
        case "list_projects":
          return queries.listProjects(mcpTools.list_projects.input.parse(input));
        case "get_project":
          return queries.getProject(mcpTools.get_project.input.parse(input));
        case "get_task":
          return queries.getTask(mcpTools.get_task.input.parse(input).taskId);
        case "list_activity":
          return queries.listActivity(mcpTools.list_activity.input.parse(input));
        case "list_task_comments":
          return queries.listComments(mcpTools.list_task_comments.input.parse(input));
        case "list_conversations":
          return messaging.listConversations(mcpTools.list_conversations.input.parse(input));
        case "list_messages":
          return messaging.listMessages(mcpTools.list_messages.input.parse(input));
        case "get_related_context":
          return relatedContext(ctx, identity, mcpTools.get_related_context.input.parse(input));
        case "create_task": {
          const value = mcpTools.create_task.input.parse(input);
          let source;
          if (value.source) {
            source = await requireMessage(tx, identity, value.source.messageId);
            if (
              source.message.conversationId !== value.source.conversationId ||
              source.conversation.organizationId !== identity.organizationId
            )
              throw new AccessDeniedError();
          }
          const task = await tasks.create({
            ...value,
            projectEntityId: value.projectId,
            parentTaskEntityId: value.parentTaskId,
            assigneeActorEntityId: value.assigneeActorId,
          });
          if (source) {
            await tx
              .insert(messageEntityReferences)
              .values({
                organizationId: identity.organizationId,
                conversationId: source.conversation.id,
                messageId: source.message.id,
                entityId: task.entityId,
                entityType: "task",
                purpose: "source",
                createdByActorEntityId: actor!.id,
              });
            await recordTaskActivity(
              ctx,
              task.entityId,
              "Created from a discussion",
              source.message.id,
            );
          }
          return { taskId: task.entityId, createdBy: actor, source: value.source ?? null };
        }
        case "update_task": {
          const { taskId, changes } = mcpTools.update_task.input.parse(input);
          await tasks.update(taskId, {
            ...changes,
            assigneeActorEntityId: changes.assigneeActorId,
          });
          return { taskId, updatedBy: actor };
        }
        case "add_task_comment": {
          const value = mcpTools.add_task_comment.input.parse(input);
          const comment = await tasks.addComment(value.taskId, value.body);
          return {
            commentId: comment.id,
            taskId: value.taskId,
            author: actor,
            createdAt: comment.createdAt,
          };
        }
        case "send_message": {
          const value = mcpTools.send_message.input.parse(input);
          const message = await createMessagingService(tx, identity).sendMessage(
            value.conversationId,
            value.body,
            value.threadId,
            value.requestId,
          );
          return {
            messageId: message.id,
            conversationId: message.conversationId,
            threadId: message.threadId,
            author: actor,
            createdAt: message.createdAt,
          };
        }
        case "attach_reference":
        case "remove_reference": {
          const value = mcpTools[tool].input.parse(input);
          const { message } = await requireMessage(tx, identity, value.message.messageId);
          if (message.conversationId !== value.message.conversationId)
            throw new AccessDeniedError();
          const { entity } = await ctx.requireAccess(value.target.id, "view");
          if (entity.entityType !== value.target.type) throw new AccessDeniedError();
          const attached = tool === "attach_reference";
          const changed = attached
            ? await context.attach(message.id, value.target.id)
            : await context.detach(message.id, value.target.id);
          return { attached, changed, actedBy: actor };
        }
      }
    }
    const requestId = "requestId" in input ? input.requestId : undefined;
    const key = requestId
      ? and(
          eq(agentToolRequests.organizationId, identity.organizationId),
          eq(agentToolRequests.actorEntityId, actor.id),
          eq(agentToolRequests.tool, tool),
          eq(agentToolRequests.requestId, requestId),
        )
      : undefined;
    const fingerprint = JSON.stringify(input);
    if (key) {
      const [existing] = await tx.select().from(agentToolRequests).where(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new ConflictError("This request ID was already used with different input.");
        // Recheck access before returning a previously created record's identifiers.
        if (tool === "create_task") {
          await tasks.get(mcpTools.create_task.output.parse(existing.result).taskId);
          const source = mcpTools.create_task.input.parse(input).source;
          if (source) await requireMessage(tx, identity, source.messageId);
        }
        if (tool === "add_task_comment")
          await tasks.get(mcpTools.add_task_comment.input.parse(input).taskId);
        if (tool === "send_message")
          await requireMessage(
            tx,
            identity,
            mcpTools.send_message.output.parse(existing.result).messageId,
          );
        return mcpTools[tool].output.parse(existing.result);
      }
    }
    const result = mcpTools[tool].output.parse(JSON.parse(JSON.stringify(await perform())));
    if (requestId)
      await tx
        .insert(agentToolRequests)
        .values({
          organizationId: identity.organizationId,
          actorEntityId: actor.id,
          tool,
          requestId,
          fingerprint,
          result,
        });
    return result;
  });
}
