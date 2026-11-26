import {
  canonicalJson,
  proposalTargetBasis,
  staleProposalError,
  type ProposalAction,
  type ProposalOutcome,
  type ProposalTargetBasis,
} from "@substrate/contracts/agent-work";

import { requireAppEnabled } from "../../../core/apps/access";
import {
  deletableAuthors,
  requireContact,
  requireInteraction,
} from "../../../core/contacts/access";
import { entities } from "../../../core/entities/schema";
import type { RepositoryContext } from "../../../core/repository-context";
import type { SessionIdentity } from "../../../core/session/identity";
import { messageReferences } from "../../../core/text/references";
import { AccessDeniedError, ConflictError, ValidationError } from "../../../errors";
import { requireWork } from "../../context/access";
import { requireMessage } from "../../messaging/access";
import { messagingConversations } from "../../messaging/schema";
import { archivedProjectMessage } from "../../projects/archive";
import { projectRepository } from "../../projects/repository";
import { agentActions } from "../actions";
import { requirePlace } from "../place";
import { and, eq, sql } from "drizzle-orm";

type Agent = Parameters<typeof agentActions>[2];
type Receipt = Extract<ProposalOutcome, { status: "executed" }>["receipt"];

// The editable task or project with its version: the time of its last change.
async function editableWork(ctx: RepositoryContext, entityId: string) {
  const work = await requireWork(ctx, entityId, "edit");
  return { ...work, version: work.updatedAt.toISOString() };
}

// An account or deal the agent can change at `minimum`, with its type and version.
async function crmRecord(ctx: RepositoryContext, entityId: string, minimum: "edit" | "owner") {
  await requireAppEnabled(ctx, "crm");
  const { entity } = await ctx.requireAccess(entityId, minimum);
  if (entity.entityType !== "account" && entity.entityType !== "deal")
    throw new AccessDeniedError();
  return { entityType: entity.entityType, version: entity.updatedAt.toISOString() };
}

// Grants and responsibility go to people; an agent acts with its owner's access.
async function requirePerson(ctx: RepositoryContext, actorId: string, message: string) {
  const target = await ctx.requireActiveActor(actorId);
  if (target.type !== "human") throw new ValidationError(message);
}

async function entityVersion(ctx: RepositoryContext, entityId: string) {
  const [row] = await ctx.db
    .select({ updatedAt: entities.updatedAt })
    .from(entities)
    .where(
      and(eq(entities.organizationId, ctx.scope.organizationId), eq(entities.entityId, entityId)),
    );
  if (!row) throw new AccessDeniedError();
  return row.updatedAt.toISOString();
}

// A project the agent owns, in the archive state the action needs, and its version.
async function ownedProject(ctx: RepositoryContext, projectId: string, archived: boolean) {
  await requireAppEnabled(ctx, "tasks");
  const { entity } = await ctx.requireAccess(projectId, "owner");
  if (entity.entityType !== "project") throw new AccessDeniedError();
  const project = await projectRepository(ctx).get(projectId);
  if (!project.archivedAt !== !archived)
    throw new ValidationError(archived ? "Archive the project first." : archivedProjectMessage);
  return entity.updatedAt.toISOString();
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
    case "delete_task": {
      await requireAppEnabled(ctx, "tasks");
      const task = await editableWork(ctx, action.input.taskId);
      if (task.entityType !== "task") throw new AccessDeniedError();
      return { type: action.type, taskUpdatedAt: task.version };
    }
    case "archive_project":
    case "revoke_project_access":
      return {
        type: action.type,
        projectUpdatedAt: await ownedProject(ctx, action.input.projectId, false),
      };
    case "share_project": {
      const projectUpdatedAt = await ownedProject(ctx, action.input.projectId, false);
      // Checked again when the grant is written; this fails a proposal that could never run.
      const target = await ctx.requireActiveActor(action.input.actorId);
      if (target.type !== "human")
        throw new ValidationError("Agents use their owner's access. Share with the owner instead.");
      return { type: action.type, projectUpdatedAt };
    }
    case "restore_project":
    case "delete_project":
      return {
        type: action.type,
        projectUpdatedAt: await ownedProject(ctx, action.input.projectId, true),
      };
    case "archive_crm_record": {
      const { kind, entityId } = action.input;
      await requireAppEnabled(ctx, "crm");
      if (kind === "contact") await requireContact(ctx, entityId);
      else if ((await crmRecord(ctx, entityId, "edit")).entityType !== kind)
        throw new AccessDeniedError();
      return { type: action.type, recordUpdatedAt: await entityVersion(ctx, entityId) };
    }
    case "delete_crm_interaction": {
      await requireAppEnabled(ctx, "crm");
      const { interaction } = await requireInteraction(ctx, action.input.entityId);
      const author = interaction.createdByActorEntityId;
      if (!(await deletableAuthors(ctx, [author])).has(author)) throw new AccessDeniedError();
      return {
        type: action.type,
        recordUpdatedAt: await entityVersion(ctx, action.input.entityId),
      };
    }
    case "assign_crm_owner": {
      const { version } = await crmRecord(ctx, action.input.entityId, "edit");
      await requirePerson(
        ctx,
        action.input.ownerActorId,
        "Responsibility requires an active organization human.",
      );
      return { type: action.type, recordUpdatedAt: version };
    }
    case "share_crm_record": {
      const { version } = await crmRecord(ctx, action.input.entityId, "owner");
      await requirePerson(
        ctx,
        action.input.actorId,
        "Agents use their owner's access. Share with the owner instead.",
      );
      return { type: action.type, recordUpdatedAt: version };
    }
    case "revoke_crm_access":
      return {
        type: action.type,
        recordUpdatedAt: (await crmRecord(ctx, action.input.entityId, "owner")).version,
      };
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
  if (
    (action.type === "update_task" && basis.type === "update_task") ||
    (action.type === "delete_task" && basis.type === "delete_task")
  )
    return bindWork(ctx, action.input.taskId, basis.taskUpdatedAt);
  if ("projectUpdatedAt" in basis && action.type === basis.type && "projectId" in action.input)
    return bindWork(ctx, action.input.projectId, basis.projectUpdatedAt);
  if ("recordUpdatedAt" in basis && action.type === basis.type && "entityId" in action.input)
    return bindWork(ctx, action.input.entityId, basis.recordUpdatedAt);
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
      const receipt: Receipt = {
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
    case "delete_task": {
      await writes.deleteTask(action.input);
      return { receipt: deleted("task", action.input.taskId) };
    }
    case "delete_project": {
      await writes.deleteProject(action.input);
      return { receipt: deleted("project", action.input.projectId) };
    }
    case "archive_project":
      await writes.archiveProject(action.input);
      return { receipt: project(action.input.projectId) };
    case "restore_project":
      await writes.restoreProject(action.input);
      return { receipt: project(action.input.projectId) };
    case "share_project":
      await writes.shareProject(action.input);
      return { receipt: project(action.input.projectId) };
    case "revoke_project_access":
      await writes.revokeProjectAccess(action.input);
      return { receipt: project(action.input.projectId) };
    case "archive_crm_record":
      await writes.archiveCrmRecord(action.input);
      return { receipt: crm(action.input.kind, action.input.entityId) };
    case "delete_crm_interaction":
      await writes.deleteCrmInteraction(action.input);
      return { receipt: deleted("contact_interaction", action.input.entityId) };
    case "assign_crm_owner":
    case "share_crm_record":
    case "revoke_crm_access": {
      // Read before the write: revoking the owner's own grant can end their read access.
      const { entityType } = await crmRecord(ctx, action.input.entityId, "edit");
      if (action.type === "assign_crm_owner") await writes.assignCrmOwner(action.input);
      else if (action.type === "share_crm_record") await writes.shareCrmRecord(action.input);
      else await writes.revokeCrmAccess(action.input);
      return { receipt: crm(entityType, action.input.entityId) };
    }
  }
}

const crm = (entityType: "account" | "contact" | "deal", id: string): Receipt => ({
  kind: "crm",
  entityType,
  id,
});

const project = (id: string): Receipt => ({ kind: "project", id });
const deleted = (entityType: "task" | "project" | "contact_interaction", id: string): Receipt => ({
  kind: "deleted",
  entityType,
  id,
});
