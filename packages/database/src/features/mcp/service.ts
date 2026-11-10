import type { TurnContext, WorkspaceApiRequest } from "@startup-os/contracts/harness/mcp";
import {
  mcpTools,
  type McpInput,
  type McpOutput,
  type ServerToolName,
} from "@startup-os/contracts/harness/tools";
import type { RealtimeHint } from "@startup-os/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { findDevice } from "../../core/devices/repository";
import { ConflictError, AccessDeniedError, ValidationError } from "../../errors";
import { agentRequests } from "../agent-work/requests.schema";
import { workspaceContext } from "../context/access";
import { attachReference, detachReference } from "../context/service";
import type { MessagingIdentity } from "../messaging/access";
import { requireMessage } from "../messaging/access";
import { messageChangeHints } from "../realtime/routing";
import { taskRepository } from "../tasks/repository";
import { mcpContextQueries } from "./context";
import { listLinks } from "./links";
import { mcpMessagingQueries } from "./messaging";
import { publishingTools } from "./publishing";
import { agentToolRequests } from "./schema";
import { mcpTaskQueries } from "./tasks";
import { proposeInstead, requireTurn } from "./turn";
import { agentWrites } from "./writes";
import { and, eq } from "drizzle-orm";

type AgentToolExecution = {
  [K in ServerToolName]: {
    tool: K;
    input: McpInput<K>;
    output: McpOutput<K>;
    hints: RealtimeHint[];
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

// In background turns the agent may only publish to its own place or propose.
const unattendedWrites: ReadonlySet<ServerToolName> = new Set(["reply", "propose"]);
const handoffIsQuiet =
  "A handoff turn saves its notes with save_handoff. It does not publish, propose or change records.";

function requestIdOf(input: McpInput<ServerToolName>) {
  return "requestId" in input ? input.requestId : undefined;
}

export async function executeAgentTool<K extends ServerToolName>(
  db: DatabaseExecutor,
  identity: MessagingIdentity & { actorEntityId: string },
  tool: K,
  raw: WorkspaceApiRequest["input"],
  turn: TurnContext,
) {
  const definition = mcpTools[tool];
  // SAFETY: `definition` is the registry entry for `tool`, so its schema produces McpInput<K>.
  const input = definition.input.parse(raw) as McpInput<K>;
  // Message hints a write built in its transaction, published by the caller after commit.
  const hints: RealtimeHint[] = [];
  const output = await db.transaction(async (tx) => {
    // Writes lock the agent's actor row so one agent's writes run one at a time. Reads run in
    // parallel.
    const {
      context: ctx,
      actor: agent,
      userName,
    } = await workspaceContext(tx, identity, { lockActor: !definition.readOnly });
    const actor = { id: agent.entityId, name: agent.name, type: agent.type };
    // Writes use the turn context, so the turn is checked before any write runs.
    let userAgentId: string | null = null;
    if (!definition.readOnly) {
      if (turn.purpose === "handoff") throw new ValidationError(handoffIsQuiet);
      if (turn.kind === "unattended" && !unattendedWrites.has(tool))
        throw new ValidationError(proposeInstead);
      // Only the agent's home desktop runs its turns. The share lock keeps the agent from moving
      // to another desktop until this write commits.
      const [row] = await tx
        .select({ userAgentId: userAgents.id, homeDeviceId: userAgents.homeDeviceId })
        .from(actors)
        .innerJoin(userAgents, eq(userAgents.id, actors.userAgentId))
        .where(and(eq(actors.entityId, agent.entityId), eq(userAgents.userId, identity.userId)))
        .for("share", { of: userAgents });
      if (!row?.homeDeviceId || !turn.installationId) throw new AccessDeniedError();
      const device = await findDevice(tx, identity.userId, turn.installationId);
      if (device?.id !== row.homeDeviceId) throw new AccessDeniedError();
      userAgentId = row.userAgentId;
      await requireTurn(tx, identity, { actorId: agent.entityId, userAgentId }, turn);
    }
    const tasks = taskRepository(ctx);
    const writes = agentWrites(ctx, identity, agent);
    const context = mcpContextQueries(ctx, identity);
    const queries = mcpTaskQueries(ctx, identity);
    const messaging = mcpMessagingQueries(ctx, identity);
    const publishing = () => {
      if (!userAgentId) throw new AccessDeniedError();
      return publishingTools(ctx, identity, { ...agent, userAgentId }, turn);
    };
    const handlers: ToolHandlers = {
      get_me: () => context.getMe(actor, userName),
      search: (value) => context.search(value),
      list_assignees: (value) => context.listAssignees(value),
      list_projects: (value) => queries.listProjects(value),
      get_project: (value) => queries.getProject(value),
      list_tasks: (value) => queries.listTasks(value),
      get_task: (value) => queries.getTask(value.taskId),
      list_task_activity: (value) => queries.listActivity(value),
      list_task_comments: (value) => queries.listComments(value),
      list_conversations: (value) => messaging.listConversations(value),
      read_conversation: (value) => messaging.readConversation(value),
      read_thread: (value) => messaging.readThread(value),
      list_links: (value) => listLinks(ctx, identity, value),
      create_task: (value) => writes.createTask(value),
      update_task: (value) => writes.updateTask(value),
      async add_task_comment(value) {
        const comment = await tasks.addComment(value.taskId, value.body);
        return { id: comment.id, taskId: value.taskId, createdAt: comment.createdAt };
      },
      async reply(value) {
        const { hints: messageHints, ...result } = await publishing().reply(value);
        hints.push(...messageHints);
        return result;
      },
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
      async create_task(value, previous) {
        await tasks.get(previous.id);
        if (value.sourceMessageId) await requireMessage(tx, identity, value.sourceMessageId);
      },
      async update_task(value) {
        await tasks.get(value.taskId);
      },
      async add_task_comment(value) {
        await tasks.get(value.taskId);
      },
      async reply(_, previous) {
        await requireMessage(tx, identity, previous.messageId);
      },
      async propose(_, previous) {
        const [request] = await tx
          .select({ id: agentRequests.id })
          .from(agentRequests)
          .where(
            and(
              eq(agentRequests.id, previous.proposalId),
              eq(agentRequests.ownerUserId, identity.userId),
            ),
          );
        if (!request) throw new AccessDeniedError();
      },
    };
    const requestId = requestIdOf(input);
    const key = requestId
      ? and(
          eq(agentToolRequests.organizationId, identity.organizationId),
          eq(agentToolRequests.actorEntityId, actor.id),
          eq(agentToolRequests.tool, tool),
          eq(agentToolRequests.requestId, requestId),
        )
      : undefined;
    const fingerprint = JSON.stringify(input);
    const [existing] = key ? await tx.select().from(agentToolRequests).where(key) : [];
    if (existing && existing.fingerprint !== fingerprint)
      throw new ConflictError("This request ID was already used with different input.");
    // Stored and new results cross the same trust boundary, so parse them in one place.
    // SAFETY: `definition` is the registry entry for `tool`, so its schema produces McpOutput<K>.
    const result = definition.output.parse(
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
      // A replay changes nothing. The hint still lets viewers recover from a lost first publish.
      if (tool === "reply")
        hints.push(
          ...messageChangeHints(
            {
              // SAFETY: `result` was parsed with the reply tool's output schema.
              conversationId: (result as McpOutput<"reply">).conversationId,
              organizationId: identity.organizationId,
            },
            { joined: false },
          ),
        );
    } else if (requestId)
      await tx.insert(agentToolRequests).values({
        organizationId: identity.organizationId,
        actorEntityId: actor.id,
        tool,
        requestId,
        fingerprint,
        result,
        turnId: turn.turnId,
        attempt: turn.attempt,
      });
    return result;
  });
  // SAFETY: input and output were parsed with the registry entry for the same tool.
  return { tool, input, output, hints } as Extract<AgentToolExecution, { tool: K }>;
}
