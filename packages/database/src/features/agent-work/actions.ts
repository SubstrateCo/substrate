import type { ProposalAction } from "@substrate/contracts/agent-work";

import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError } from "../../errors";
import { recordTaskSource } from "../context/service";
import { requireMessage } from "../messaging/access";
import { sendMessageAs } from "../messaging/messages/messages";
import { taskRepository } from "../tasks/repository";

type Agent = { entityId: string; name: string; type: "human" | "agent" };

/**
 * Writes an agent makes as its own actor with its owner's access. MCP tools and approved
 * proposals both use these, so an approval runs exactly the checks the tool runs.
 */
export function agentActions(ctx: RepositoryContext, identity: SessionIdentity, agent: Agent) {
  const { db: tx } = ctx;
  const tasks = taskRepository(ctx);
  return {
    async createTask({
      sourceMessageId,
      ...value
    }: Extract<ProposalAction, { type: "create_task" }>["input"]) {
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
      if (source)
        await recordTaskSource(
          ctx,
          { messageId: source.message.id, conversationId: source.conversation.id },
          task,
        );
      return task;
    },
    async updateTask({
      taskId,
      changes,
    }: Extract<ProposalAction, { type: "update_task" }>["input"]) {
      return tasks.update(taskId, { ...changes, assigneeActorEntityId: changes.assigneeActorId });
    },
    postMessage(
      this: void,
      message: {
        conversationId: string;
        threadId?: string;
        body: string;
        requestId: string;
        originTurnId: string;
      },
    ) {
      return sendMessageAs(ctx, identity, { actor: agent, authorName: agent.name }, message);
    },
  };
}
