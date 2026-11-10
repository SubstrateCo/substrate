import type { McpInput } from "@startup-os/contracts/harness/tools";

import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { recordTaskActivity } from "../activity/events";
import { messageEntityReferences } from "../context/schema";
import { requireMessage, type MessagingIdentity } from "../messaging/access";
import { sendMessageAs } from "../messaging/messages";
import { taskRepository } from "../tasks/repository";
import { mcpTaskQueries } from "./tasks";

type Agent = { entityId: string; name: string; type: "human" | "agent" };

/**
 * Writes an agent makes as its own actor with its owner's access. MCP tools and approved
 * proposals both use these, so an approval runs exactly the checks the tool runs.
 */
export function agentWrites(ctx: RepositoryContext, identity: MessagingIdentity, agent: Agent) {
  const { db: tx } = ctx;
  const tasks = taskRepository(ctx);
  const queries = mcpTaskQueries(ctx, identity);
  return {
    async createTask({
      sourceMessageId,
      ...value
    }: Omit<McpInput<"create_task">, "requestId"> & { requestId?: string }) {
      let source;
      if (sourceMessageId) {
        source = await requireMessage(tx, identity, sourceMessageId);
        if (source.conversation.organizationId !== identity.organizationId)
          throw new AccessDeniedError();
      }
      const task = await tasks.create({
        ...value,
        projectEntityId: value.projectId,
        parentTaskEntityId: value.parentTaskId,
        assigneeActorEntityId: value.assigneeActorId,
      });
      if (source) {
        await tx.insert(messageEntityReferences).values({
          organizationId: identity.organizationId,
          conversationId: source.conversation.id,
          messageId: source.message.id,
          entityId: task.entityId,
          entityType: "task",
          purpose: "source",
          createdByActorEntityId: agent.entityId,
        });
        await recordTaskActivity(
          ctx,
          task.entityId,
          "Created from a discussion",
          source.message.id,
        );
      }
      return queries.getTask(task.entityId);
    },
    async updateTask({ taskId, changes }: Pick<McpInput<"update_task">, "taskId" | "changes">) {
      await tasks.update(taskId, { ...changes, assigneeActorEntityId: changes.assigneeActorId });
      return queries.getTask(taskId);
    },
    postMessage(message: {
      conversationId: string;
      threadId?: string;
      body: string;
      requestId: string;
      originTurnId: string;
    }) {
      return sendMessageAs(ctx, identity, { actor: agent, authorName: agent.name }, message);
    },
  };
}
