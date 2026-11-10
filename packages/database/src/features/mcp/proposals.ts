import {
  canonicalJson,
  proposalTargetBasis,
  staleProposalError,
  type ProposalAction,
  type ProposalOutcome,
  type ProposalTargetBasis,
} from "@startup-os/contracts/agent-work";

import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ConflictError } from "../../errors";
import { requirePlace } from "../agent-work/place";
import { requireWork } from "../context/access";
import { messageReferences } from "../context/references";
import { requireMessage, type MessagingIdentity } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { agentWrites } from "./writes";
import { and, eq } from "drizzle-orm";

type Agent = Parameters<typeof agentWrites>[2];

// The editable task or project with its version. With lock, its access path stays locked until
// the transaction ends, in the same order the task repository locks it.
async function editableWork(ctx: RepositoryContext, entityId: string, lock: boolean) {
  if (lock) await ctx.lockAccessPath(entityId);
  const work = await requireWork(ctx, entityId, "edit");
  return { ...work, version: work.updatedAt.toISOString() };
}

/**
 * Checks that the agent could run the action now and returns the state of its targets. With
 * lock, the targets stay locked until the transaction ends, so they cannot change before the
 * action runs. Execution checks again through the same writes.
 */
export async function checkProposalAccess(
  ctx: RepositoryContext,
  identity: MessagingIdentity,
  action: ProposalAction,
  lock = false,
): Promise<ProposalTargetBasis> {
  switch (action.type) {
    case "reply_elsewhere": {
      messageReferences(action.input.body);
      const { conversationId, threadId = null } = action.input;
      // Lock before the visibility check, so the audience cannot change after it.
      const conversation = ctx.db
        .select({ kind: messagingConversations.kind, private: messagingConversations.private })
        .from(messagingConversations)
        .where(eq(messagingConversations.id, conversationId));
      const [target] = lock ? await conversation.for("no key update") : await conversation;
      if (lock && threadId)
        await ctx.db
          .select({ id: messagingMessages.id })
          .from(messagingMessages)
          .where(
            and(
              eq(messagingMessages.conversationId, conversationId),
              eq(messagingMessages.id, threadId),
            ),
          )
          .for("no key update");
      await requirePlace(ctx.db, identity, action.input);
      if (!target) throw new AccessDeniedError();
      return { type: action.type, conversationId, threadId, ...target };
    }
    case "create_task": {
      const project = await editableWork(ctx, action.input.projectId, lock);
      if (project.entityType !== "project") throw new AccessDeniedError();
      let parentTaskUpdatedAt = null;
      if (action.input.parentTaskId)
        parentTaskUpdatedAt = (await editableWork(ctx, action.input.parentTaskId, lock)).version;
      if (action.input.sourceMessageId)
        await requireMessage(ctx.db, identity, action.input.sourceMessageId);
      return { type: action.type, projectUpdatedAt: project.version, parentTaskUpdatedAt };
    }
    case "update_task": {
      const task = await editableWork(ctx, action.input.taskId, lock);
      if (task.entityType !== "task") throw new AccessDeniedError();
      return { type: action.type, taskUpdatedAt: task.version };
    }
  }
}

/**
 * Runs exactly the approved action as the agent, only while its targets are as they were
 * proposed. The request ID keys the message, so the same proposal cannot post twice.
 */
export async function runProposalAction(
  ctx: RepositoryContext,
  identity: MessagingIdentity,
  agent: Agent,
  proposal: { id: string; turnId: string; action: ProposalAction; targetBasis: unknown },
) {
  const current = await checkProposalAccess(ctx, identity, proposal.action, true);
  const proposed = proposalTargetBasis.safeParse(proposal.targetBasis);
  if (!proposed.success || canonicalJson(proposed.data) !== canonicalJson(current))
    throw new ConflictError(staleProposalError);
  const writes = agentWrites(ctx, identity, agent);
  const { action } = proposal;
  switch (action.type) {
    case "reply_elsewhere": {
      const message = await writes.postMessage({
        ...action.input,
        requestId: proposal.id,
        originTurnId: proposal.turnId,
      });
      const receipt: Extract<ProposalOutcome, { status: "executed" }>["receipt"] = {
        kind: "message",
        id: message.id,
        conversationId: message.conversationId,
        threadId: message.threadId,
      };
      return { receipt, hints: message.hints };
    }
    case "create_task": {
      const task = await writes.createTask(action.input);
      return {
        receipt: { kind: "task" as const, id: task.id, projectId: task.project.id },
        hints: [],
      };
    }
    case "update_task": {
      const task = await writes.updateTask(action.input);
      return {
        receipt: { kind: "task" as const, id: task.id, projectId: task.project.id },
        hints: [],
      };
    }
  }
}
