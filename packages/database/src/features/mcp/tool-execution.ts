import { isOptionalApp } from "@substrate/contracts/apps";
import type { TurnContext, WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";
import {
  mcpTools,
  toolApps,
  type McpInput,
  type McpOutput,
  type ServerToolName,
} from "@substrate/contracts/harness/tools";

import { requireAppsEnabled } from "../../core/apps/access";
import { effectsFor } from "../../core/effects";
import type { DatabaseExecutor } from "../../core/executor";
import type { SessionIdentity } from "../../core/session/identity";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError, ValidationError } from "../../errors";
import { proposalInput } from "../agent-work/requests/proposals";
import { requireMessage } from "../messaging/access";
import { messageChangeHints } from "../realtime/routing";
import { taskRepository } from "../tasks/repository";
import { auditCallerTool, namedIds, requireCallerTurn } from "./caller-turn";
import { mcpCrmTools } from "./crm";
import type { FileContentReader } from "./files";
import { serverToolHandlers } from "./handlers";
import { proposeToolCall } from "./proposals";
import { claimToolReceipt, requireHomeDevice, saveToolReceipt } from "./repository";
import { mcpTaskQueries } from "./tasks";
import { requireTurn } from "./turn";
import { approvalNeeded, writeGate } from "./write-gate";
import { z } from "zod";

type AgentToolExecution = {
  [K in ServerToolName]: {
    tool: K;
    input: McpInput<K>;
    output: McpOutput<K>;
  };
}[ServerToolName];

/** A call stored as a proposal instead of running. requestId names the proposal. */
export type PendingToolCall = { tool: ServerToolName; pending: { requestId: string } };

// Every tool that accepts requestId can replay a stored result, so each one must recheck access.
type ReplayableTool = {
  [K in ServerToolName]: McpInput<K> extends { requestId: string } ? K : never;
}[ServerToolName];
type ReplayChecks = {
  [K in ReplayableTool]: (input: McpInput<K>, output: McpOutput<K>) => Promise<void>;
};

const pendingReceipt = z.strictObject({ approvalPending: z.uuid() });

function requestIdOf(input: McpInput<ServerToolName>) {
  return "requestId" in input ? input.requestId : undefined;
}

export function parseAgentToolInput<K extends ServerToolName>(
  tool: K,
  raw: WorkspaceApiRequest["input"],
) {
  // SAFETY: the registry entry for `tool` produces McpInput<K>.
  return mcpTools[tool].input.parse(raw) as McpInput<K>;
}

export async function executeAgentToolInTransaction<K extends ServerToolName>(
  tx: DatabaseExecutor,
  identity: SessionIdentity & { actorEntityId: string },
  tool: K,
  input: McpInput<K>,
  turn: TurnContext,
  reader?: FileContentReader,
): Promise<Extract<AgentToolExecution, { tool: K }> | PendingToolCall> {
  const definition = mcpTools[tool];
  // Hints go to the caller's commit() collector and are published after commit.
  const { context: ctx, actor: agent, userName } = await workspaceContext(tx, identity);
  // Check current settings before handlers or cached results can expose disabled app data.
  await requireAppsEnabled(ctx, toolApps(tool).filter(isOptionalApp));
  const actor = { id: agent.entityId, name: agent.name, type: agent.type };
  // A turn that answers callers names their calls; each call is audited, reads included.
  const calls = await requireCallerTurn(tx, identity, turn);
  // Writes use the turn context, so the turn is checked before any write runs.
  let userAgentId: string | null = null;
  if (!definition.readOnly) {
    const blocked = writeGate(turn, tool);
    if (blocked) throw new ValidationError(blocked);
    userAgentId = await requireHomeDevice(tx, identity, agent.entityId, turn.installationId);
  }
  if (userAgentId) await requireTurn(tx, identity, { actorId: agent.entityId, userAgentId }, turn);
  const tasks = taskRepository(ctx);
  const queries = mcpTaskQueries(ctx, identity);
  const crm = () => mcpCrmTools(ctx, identity);
  const handlers = serverToolHandlers(
    ctx,
    identity,
    { ...agent, userName },
    { kind: "turn", turn, userAgentId },
    reader,
  ); // Recheck access before returning a previously created record's identifiers.
  const replayChecks: ReplayChecks = {
    async create_crm_from_message(value, previous) {
      const { conversation, message } = await requireMessage(tx, identity, value.messageId);
      if (message.deletedAt || conversation.organizationId !== identity.organizationId)
        throw new AccessDeniedError();
      await ctx.requireAccess(previous.entityId, "view");
    },
    async update_crm_settings() {
      await crm().requireSettingsAdmin();
    },
    async create_crm_follow_up(value, previous) {
      await tasks.get(previous.id);
      await ctx.requireAccess(value.entityId, "view");
    },
    async create_crm_account(_, previous) {
      await crm().get({ kind: "account", entityId: previous.record.entityId });
    },
    async update_crm_account(value) {
      await crm().get({ kind: "account", entityId: value.entityId });
    },
    async create_crm_contact(_, previous) {
      await crm().get({ kind: "contact", entityId: previous.record.entityId });
    },
    async update_crm_contact(value) {
      await crm().get({ kind: "contact", entityId: value.entityId });
    },
    async create_crm_deal(value, previous) {
      const tools = crm();
      await tools.get({ kind: "deal", entityId: previous.record.entityId });
      await tools.requireDealRelations(value);
    },
    async update_crm_deal(value) {
      const tools = crm();
      await tools.get({ kind: "deal", entityId: value.entityId });
      await tools.requireDealRelations(value);
    },
    async transition_crm_deal(value, previous) {
      const tools = crm();
      await tools.get({ kind: "deal", entityId: value.entityId });
      if (previous.record.accountEntityId)
        await tools.get(
          parseAgentToolInput("get_crm_record", {
            kind: "account",
            entityId: previous.record.accountEntityId,
          }),
        );
    },
    async create_crm_interaction(_, previous) {
      await crm().requireInteraction(previous.record.entityId);
    },
    async update_crm_interaction(value) {
      await crm().requireInteraction(value.entityId);
    },
    async change_crm_contact_detail(value) {
      await crm().requireContact(value.contactEntityId);
    },
    async set_crm_affiliation(value) {
      await crm().requireContact(value.contactEntityId);
      await crm().get({ kind: "account", entityId: value.accountEntityId });
    },
    async remove_crm_affiliation(value) {
      await crm().requireContact(value.contactEntityId);
      await crm().get({ kind: "account", entityId: value.accountEntityId });
    },
    async create_task(value, previous) {
      await tasks.get(previous.id);
      if (value.sourceMessageId) await requireMessage(tx, identity, value.sourceMessageId);
    },
    async update_task(value) {
      await tasks.get(value.taskId);
    },
    async move_task(value) {
      await tasks.get(value.taskId);
    },
    async create_project(_, previous) {
      await ctx.requireAccess(previous.id, "view");
    },
    async update_project(value) {
      await ctx.requireAccess(value.projectId, "view");
    },
    // A deletion's result names only the IDs in its input, so a replay reveals nothing new.
    async delete_task() {},
    async delete_project() {},
    async delete_crm_interaction() {},
    async archive_project(value) {
      await ctx.requireAccess(value.projectId, "view");
    },
    async restore_project(value) {
      await ctx.requireAccess(value.projectId, "view");
    },
    async share_project(value) {
      await ctx.requireAccess(value.projectId, "view");
    },
    async revoke_project_access(value) {
      await ctx.requireAccess(value.projectId, "view");
    },
    async archive_crm_record(value) {
      await crm().get({ kind: value.kind, entityId: value.entityId });
    },
    // These results name only the record and person in the input.
    async assign_crm_owner() {},
    async share_crm_record() {},
    async revoke_crm_access() {},
    async get_task_discussion(value) {
      await tasks.get(value.taskId);
    },
    async add_task_link(value) {
      await tasks.get(value.taskId);
      await tasks.get(value.otherTaskId);
    },
    async remove_task_link(value) {
      await tasks.get(value.taskId);
    },
    async attach_task_file(value) {
      await tasks.get(value.taskId);
      await requireMessage(tx, identity, value.file.messageId);
    },
    async reply(_, previous) {
      await requireMessage(tx, identity, previous.messageId);
    },
  };
  const requestId = requestIdOf(input);
  const key = requestId
    ? { organizationId: identity.organizationId, actorEntityId: actor.id, tool, requestId }
    : undefined;
  const fingerprint = JSON.stringify(input);
  const existing = key ? await claimToolReceipt(tx, key, fingerprint, turn) : undefined;
  const audited = async (resultIds: string[]) => {
    if (calls.length)
      await auditCallerTool(tx, calls, {
        tool,
        readOnly: definition.readOnly,
        turnId: turn.turnId,
        targetIds: [...namedIds(fingerprint), ...resultIds],
      });
  };
  // A retry of a call that waits for the owner returns the same proposal. It names only the
  // proposal, so it reveals nothing new.
  const stored = existing && pendingReceipt.safeParse(existing.result);
  if (stored?.success) {
    await audited([]);
    return { tool, pending: { requestId: stored.data.approvalPending } };
  }
  // The call waits for the owner: store it as a proposal and commit, without running it.
  if (!existing && approvalNeeded(tool)) {
    if (!userAgentId) throw new AccessDeniedError();
    const proposalId = await proposeToolCall(
      ctx,
      identity,
      { entityId: agent.entityId, userAgentId },
      turn,
      { tool, input: proposalInput(input) },
    );
    if (key) await saveToolReceipt(tx, key, { approvalPending: proposalId });
    await audited([]);
    return { tool, pending: { requestId: proposalId } };
  }
  // SAFETY: the handler for `tool` takes McpInput<K>.
  const handler = handlers[tool] as (input: McpInput<K>) => Promise<object>;
  // Stored and new results cross the same trust boundary, so parse them in one place.
  // SAFETY: `definition` is the registry entry for `tool`, so its schema produces McpOutput<K>.
  let result = definition.output.parse(
    existing ? existing.result : JSON.parse(JSON.stringify(await handler(input))),
  ) as McpOutput<K>;
  if (existing) {
    // SAFETY: a stored result exists only for a tool with requestId, and the check is keyed by that tool.
    const recheck = (
      replayChecks as Partial<
        Record<ServerToolName, (input: McpInput<K>, output: McpOutput<K>) => Promise<void>>
      >
    )[tool];
    if (!recheck) throw new AccessDeniedError();
    await recheck(input, result);
    if (tool === "create_crm_from_message") {
      const previous = mcpTools.create_crm_from_message.output.parse(result);
      const current = await crm().fromMessageView(previous);
      // SAFETY: rebuild the current public projection, then cross the same output boundary.
      result = definition.output.parse(JSON.parse(JSON.stringify(current))) as McpOutput<K>;
    }
    if (tool === "create_crm_follow_up") {
      const previous = mcpTools.create_crm_follow_up.output.parse(result);
      // Task moves and access changes invalidate cached project, parent and source projections.
      // SAFETY: the refreshed task crosses the same tool-specific output schema as a new result.
      result = definition.output.parse(await queries.getTask(previous.id)) as McpOutput<K>;
    }
    if (tool === "reply") {
      // SAFETY: `result` was parsed with the reply tool's output schema.
      const reply = result as McpOutput<"reply">;
      effectsFor(tx).replay(
        messageChangeHints(
          {
            conversationId: reply.conversationId,
            organizationId: identity.organizationId,
            messageId: reply.messageId,
            threadId: reply.threadId,
          },
          { joined: false },
        ),
      );
    }
  } else if (key) await saveToolReceipt(tx, key, result);
  await audited(namedIds(JSON.stringify(result)));
  // SAFETY: input and output were parsed with the registry entry for the same tool.
  return { tool, input, output: result } as Extract<AgentToolExecution, { tool: K }>;
}
