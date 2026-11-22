import {
  canonicalJson,
  proposalTargetBasis,
  staleProposalError,
  type ProposalAction,
  type ProposalOutcome,
  type ProposalTargetBasis,
} from "@substrate/contracts/agent-work";

import { requireAppEnabled } from "../../core/apps/access";
import { entities } from "../../core/entities/schema";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { messageReferences } from "../../core/text/references";
import { AccessDeniedError, ConflictError } from "../../errors";
import { requireWork } from "../context/access";
import { requireMessage } from "../messaging/access";
import { messagingConversations } from "../messaging/schema";
import { agentActions } from "./actions";
import { requirePlace } from "./place";
import { and, eq, sql } from "drizzle-orm";

type Agent = Parameters<typeof agentActions>[2];

// The editable task or project with its version: the time of its last change.
async function editableWork(ctx: RepositoryContext, entityId: string) {
  const work = await requireWork(ctx, entityId, "edit");
  return { ...work, version: work.updatedAt.toISOString() };
}

/**
 * Checks that the agent could run the action now and returns the state of its targets.
 * Execution checks again through the same writes.
 */
export async function checkProposalAccess(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  action: ProposalAction,
): Promise<ProposalTargetBasis> {
  switch (action.type) {
    case "reply_elsewhere": {
      messageReferences(action.input.body);
      const { conversationId, threadId = null } = action.input;
      const [target] = await ctx.db
        .select({ kind: messagingConversations.kind, private: messagingConversations.private })
        .from(messagingConversations)
        .where(eq(messagingConversations.id, conversationId));
      await requirePlace(ctx.db, identity, action.input);
      if (!target) throw new AccessDeniedError();
      return { type: action.type, conversationId, threadId, ...target };
    }
    case "create_task": {
      await requireAppEnabled(ctx, "tasks");
      const { projectId, parentTaskId } = action.input;
      const project = await editableWork(ctx, projectId);
      if (project.entityType !== "project") throw new AccessDeniedError();
      let parentTaskUpdatedAt = null;
      if (parentTaskId) parentTaskUpdatedAt = (await editableWork(ctx, parentTaskId)).version;
      if (action.input.sourceMessageId)
        await requireMessage(ctx.db, identity, action.input.sourceMessageId);
      return { type: action.type, projectUpdatedAt: project.version, parentTaskUpdatedAt };
    }
    case "update_task": {
      await requireAppEnabled(ctx, "tasks");
      const task = await editableWork(ctx, action.input.taskId);
      if (task.entityType !== "task") throw new AccessDeniedError();
      return { type: action.type, taskUpdatedAt: task.version };
    }
  }
}

// Compare-and-set on the target row, without changing it. The update holds the row until the
// transaction ends, so a change that committed after the check fails it and a later change waits.
async function bindTarget(write: Promise<unknown[]>) {
  if (!(await write).length) throw new ConflictError(staleProposalError);
}

function bindWork(ctx: RepositoryContext, entityId: string, updatedAt: string) {
  return bindTarget(
    ctx.db
      .update(entities)
      .set({ updatedAt: sql`${entities.updatedAt}` })
      .where(
        and(
          eq(entities.organizationId, ctx.scope.organizationId),
          eq(entities.entityId, entityId),
          // The basis keeps milliseconds, as JavaScript dates do.
          sql`date_trunc('milliseconds', ${entities.updatedAt}) = ${updatedAt}::timestamptz`,
        ),
      )
      .returning({ entityId: entities.entityId }),
  );
}

// Binds the targets to the state that was proposed, in the action's transaction.
async function bindTargets(
  ctx: RepositoryContext,
  action: ProposalAction,
  basis: ProposalTargetBasis,
) {
  if (action.type === "reply_elsewhere" && basis.type === "reply_elsewhere")
    return bindTarget(
      ctx.db
        .update(messagingConversations)
        .set({ version: sql`${messagingConversations.version}` })
        .where(
          and(
            eq(messagingConversations.id, action.input.conversationId),
            eq(messagingConversations.kind, basis.kind),
            eq(messagingConversations.private, basis.private),
          ),
        )
        .returning({ id: messagingConversations.id }),
    );
  if (action.type === "create_task" && basis.type === "create_task") {
    await bindWork(ctx, action.input.projectId, basis.projectUpdatedAt);
    if (action.input.parentTaskId && basis.parentTaskUpdatedAt)
      await bindWork(ctx, action.input.parentTaskId, basis.parentTaskUpdatedAt);
    return;
  }
  if (action.type === "update_task" && basis.type === "update_task")
    return bindWork(ctx, action.input.taskId, basis.taskUpdatedAt);
  throw new ConflictError(staleProposalError);
}

/**
 * Runs exactly the approved action as the agent, only while its targets are as they were
 * proposed. The targets are checked again and bound to that state before the writes. The
 * caller's claim on the request makes the action run once, and the request ID keys the message,
 * so the same proposal cannot post twice.
 */
export async function runProposalAction(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  agent: Agent,
  proposal: { id: string; turnId: string; action: ProposalAction; targetBasis: unknown },
) {
  const current = await checkProposalAccess(ctx, identity, proposal.action);
  const proposed = proposalTargetBasis.safeParse(proposal.targetBasis);
  if (!proposed.success || canonicalJson(proposed.data) !== canonicalJson(current))
    throw new ConflictError(staleProposalError);
  await bindTargets(ctx, proposal.action, proposed.data);
  const writes = agentActions(ctx, identity, agent);
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
      return { receipt };
    }
    case "create_task": {
      const task = await writes.createTask(action.input);
      return {
        receipt: { kind: "task" as const, id: task.entityId, projectId: task.projectEntityId },
      };
    }
    case "update_task": {
      const task = await writes.updateTask(action.input);
      return {
        receipt: { kind: "task" as const, id: task.entityId, projectId: task.projectEntityId },
      };
    }
  }
}
