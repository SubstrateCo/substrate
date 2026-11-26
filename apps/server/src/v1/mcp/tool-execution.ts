import { isOptionalApp } from "@substrate/contracts/apps";
import type { TurnContext, WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";
import {
  mcpTools,
  toolApps,
  type McpInput,
  type McpOutput,
  type ServerToolName,
} from "@substrate/contracts/harness/tools";
import {
  requireAppsEnabled,
  effectsFor,
  type SessionIdentity,
  workspaceContext,
  AccessDeniedError,
  ValidationError,
  attachReference,
  detachReference,
  requireMessage,
  messageChangeHints,
  taskRepository,
  auditCallerTool,
  namedIds,
  requireCallerTurn,
  mcpContextQueries,
  mcpCrmTools,
  mcpMeetingTools,
  requireMeetingTurn,
  listLinkedMessages,
  mcpMessagingQueries,
  mcpSearchQueries,
  publishingTools,
  mcpTaskQueries,
  requireTurn,
  agentWrites,
  requireHomeDevice,
  requireOwnedProposal,
  claimToolReceipt,
  saveToolReceipt,
} from "@substrate/database/mcp";
import type { DatabaseExecutor } from "@substrate/database/trusted";

import { writeGate } from "./write-gate";
import { createHash } from "node:crypto";

type AgentToolExecution = {
  [K in ServerToolName]: {
    tool: K;
    input: McpInput<K>;
    output: McpOutput<K>;
  };
}[ServerToolName];

// Handler results are serialized to JSON, then parsed with the tool's output schema.
type ToolPayload = object;
type ToolHandlers = { [K in ServerToolName]: (input: McpInput<K>) => Promise<ToolPayload> };
// Every tool that accepts requestId can replay a stored result, so each one must recheck access.
type ReplayableTool = {
  [K in ServerToolName]: McpInput<K> extends { requestId: string } ? K : never;
}[ServerToolName];
type ReplayChecks = {
  [K in ReplayableTool]: (input: McpInput<K>, output: McpOutput<K>) => Promise<void>;
};

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
) {
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
  if (toolApps(tool).includes("meetings"))
    userAgentId = await requireMeetingTurn(ctx, identity, turn);
  if (userAgentId) await requireTurn(tx, identity, { actorId: agent.entityId, userAgentId }, turn);
  const tasks = taskRepository(ctx);
  const writes = agentWrites(ctx, identity, agent);
  const context = mcpContextQueries(ctx, identity);
  const queries = mcpTaskQueries(ctx, identity);
  const messaging = mcpMessagingQueries(ctx, identity);
  const search = mcpSearchQueries(ctx, identity);
  const crm = () => mcpCrmTools(ctx, identity);
  const archive = () => mcpMeetingTools(ctx, identity, turn);
  const publishing = () => {
    if (!userAgentId) throw new AccessDeniedError();
    return publishingTools(ctx, identity, { ...agent, userAgentId }, turn);
  };
  const handlers: ToolHandlers = {
    list_meetings: (value) => archive().list(value),
    get_meeting: (value) => archive().get(value),
    read_meeting_source: (value) => archive().read(value),
    create_meeting: (value) => archive().create(value),
    create_crm_from_message: async (value) => crm().createFromMessage(value),
    list_crm_activity: async (value) => crm().activity(value),
    get_crm_settings: async () => crm().settings(),
    update_crm_settings: async (value) => crm().updateSettings(value),
    create_crm_follow_up: async (value) => crm().createFollowUp(value),
    list_crm_records: async (value) => crm().list(value),
    get_crm_record: async (value) => crm().get(value),
    get_crm_pipeline: async () => crm().pipeline(),
    create_crm_account: async (value) => crm().createAccount(value),
    update_crm_account: async (value) => crm().updateAccount(value),
    create_crm_contact: async (value) => crm().createContact(value),
    update_crm_contact: async (value) => crm().updateContact(value),
    create_crm_deal: async (value) => crm().createDeal(value),
    update_crm_deal: async (value) => crm().updateDeal(value),
    transition_crm_deal: async (value) => crm().transition(value),
    list_crm_interactions: async (value) => crm().listInteractions(value),
    create_crm_interaction: async (value) => crm().createInteraction(value),
    publish_crm_interaction: async (value) => crm().publishInteraction(value),
    search_crm_interactions: async (value) => crm().searchInteractions(value),
    get_crm_interaction: async (value) => crm().getInteraction(value.entityId),
    update_crm_interaction: async (value) => crm().updateInteraction(value),
    find_crm_contacts: async (value) => crm().findContacts(value),
    change_crm_contact_detail: async (value) => crm().changeContactDetail(value),
    set_crm_affiliation: async (value) => crm().setAffiliation(value),
    remove_crm_affiliation: async (value) => crm().removeAffiliation(value),
    list_crm_follow_ups: async (value) => crm().followUps(value.entityId),
    get_me: () => context.getMe(actor, userName),
    search_names: (value) => search.names(value),
    search_content: (value) => search.content(value),
    list_assignees: (value) => context.listAssignees(value),
    list_projects: (value) => queries.listProjects(value),
    get_project: (value) => queries.getProject(value),
    list_tasks: (value) => queries.listTasks(value),
    get_task: (value) => queries.getTask(value.taskId),
    list_task_activity: (value) => queries.listActivity(value),
    list_conversations: (value) => messaging.listConversations(value),
    read_conversation: (value) => messaging.readConversation(value),
    read_thread: (value) => messaging.readThread(value),
    list_linked_messages: (value) => listLinkedMessages(ctx, identity, value),
    create_task: (value) => writes.createTask(value),
    update_task: (value) => writes.updateTask(value),
    move_task: (value) => writes.moveTask(value),
    create_project: (value) => writes.createProject(value),
    update_project: (value) => writes.updateProject(value),
    async get_task_discussion(value) {
      return { conversationId: await tasks.ensureDiscussion(value.taskId) };
    },
    async add_task_link(value) {
      await tasks.addLink(value.taskId, value.relation, value.otherTaskId);
      return queries.getTask(value.taskId);
    },
    async remove_task_link(value) {
      await tasks.removeLink(value.taskId, value.linkId);
      return queries.getTask(value.taskId);
    },
    reply: (value) => publishing().reply(value),
    propose: (value) => publishing().propose(value),
    async attach_message(value) {
      return { changed: await attachReference(ctx, identity, value, value.target) };
    },
    async detach_message(value) {
      return { changed: await detachReference(ctx, identity, value, value.target) };
    },
  };
  // Recheck access before returning a previously created record's identifiers.
  const replayChecks: ReplayChecks = {
    async create_meeting(value, previous) {
      await ctx.requireAccess(previous.id, "view");
      if (value.sourceMessageId) await archive().sourceMessage(value.sourceMessageId);
    },
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
    async reply(_, previous) {
      await requireMessage(tx, identity, previous.messageId);
    },
    async propose(_, previous) {
      await requireOwnedProposal(tx, identity, previous.proposalId);
    },
  };
  const requestId = requestIdOf(input);
  const key = requestId
    ? { organizationId: identity.organizationId, actorEntityId: actor.id, tool, requestId }
    : undefined;
  const fingerprint = JSON.stringify(input);
  // The Meetings receipt needs an equality check, not a second copy of the private transcript.
  const existing = key
    ? await claimToolReceipt(
        tx,
        key,
        tool === "create_meeting"
          ? createHash("sha256").update(fingerprint).digest("hex")
          : fingerprint,
        turn,
      )
    : undefined;
  // Stored and new results cross the same trust boundary, so parse them in one place.
  // SAFETY: `definition` is the registry entry for `tool`, so its schema produces McpOutput<K>.
  let result = definition.output.parse(
    existing ? existing.result : JSON.parse(JSON.stringify(await handlers[tool](input))),
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
  if (calls.length)
    await auditCallerTool(tx, calls, {
      tool,
      readOnly: definition.readOnly,
      turnId: turn.turnId,
      targetIds: [...namedIds(fingerprint), ...namedIds(JSON.stringify(result))],
    });
  // SAFETY: input and output were parsed with the registry entry for the same tool.
  return { tool, input, output: result } as Extract<AgentToolExecution, { tool: K }>;
}
