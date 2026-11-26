import type { McpInput } from "@substrate/contracts/agent-tools/tools";

import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError } from "../../errors";
import { recordTaskSource } from "../context/service";
import { requireMessage } from "../messaging/access";
import { sendMessageAs } from "../messaging/messages/messages";
import { projectRepository } from "../projects/repository";
import { taskRepository } from "../tasks/repository";

type Agent = { entityId: string; name: string; type: "human" | "agent" };

/** Writes an agent makes as its own actor with its owner's access. */
export function agentActions(ctx: RepositoryContext, identity: SessionIdentity, agent: Agent) {
  const { db: tx } = ctx;
  const tasks = taskRepository(ctx);
  const projects = projectRepository(ctx);
  return {
    async createTask({ sourceMessageId, ...value }: Omit<McpInput<"create_task">, "requestId">) {
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
    async updateTask({ taskId, changes }: Pick<McpInput<"update_task">, "taskId" | "changes">) {
      return tasks.update(taskId, { ...changes, assigneeActorEntityId: changes.assigneeActorId });
    },
    /** Moves the task from the project it is in now. A move that commits first fails this one. */
    async moveTask({ taskId, projectId, parentTaskId }: Omit<McpInput<"move_task">, "requestId">) {
      const task = await tasks.get(taskId);
      await tasks.move(taskId, task.projectEntityId, projectId, parentTaskId);
      return tasks.get(taskId);
    },
    createProject({ name, description }: Omit<McpInput<"create_project">, "requestId">) {
      return projects.create({ name, description });
    },
    async updateProject({ projectId, changes }: Omit<McpInput<"update_project">, "requestId">) {
      return ctx.transaction(async (tx) => {
        const repository = projectRepository(tx);
        const current = await repository.get(projectId);
        return repository.update(projectId, {
          name: changes.name ?? current.name,
          description: changes.description ?? current.description,
        });
      });
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
