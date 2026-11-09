import type { WorkspaceApiRequest } from "@startup-os/contracts/harness/mcp";
import {
  mcpTools,
  type McpInput,
  type McpOutput,
  type McpToolName,
} from "@startup-os/contracts/harness/tools";

import type { DatabaseExecutor } from "../../client";
import { ConflictError, AccessDeniedError } from "../../errors";
import { recordTaskActivity } from "../activity/events";
import { recordRunReply } from "../agent-runs/replies";
import { workspaceContext } from "../context/access";
import { messageEntityReferences } from "../context/schema";
import { attachReference, detachReference } from "../context/service";
import type { MessagingIdentity } from "../messaging/access";
import { requireMessage } from "../messaging/access";
import { sendMessageAs } from "../messaging/service";
import { taskRepository } from "../tasks/repository";
import { mcpContextQueries } from "./context";
import { listLinks } from "./links";
import { mcpMessagingQueries } from "./messaging";
import { agentToolRequests } from "./schema";
import { mcpTaskQueries } from "./tasks";
import { and, eq } from "drizzle-orm";

type AgentToolExecution = {
  [K in McpToolName]: { tool: K; input: McpInput<K>; output: McpOutput<K> };
}[McpToolName];

// Handler results are serialized to JSON, then parsed with the tool's output schema.
type ToolPayload = object;
type ToolHandlers = { [K in McpToolName]: (input: McpInput<K>) => Promise<ToolPayload> };
// Every tool that accepts requestId can replay a stored result, so each one must recheck access.
type ReplayableTool = {
  [K in McpToolName]: McpInput<K> extends { requestId: string } ? K : never;
}[McpToolName];
type ReplayChecks = {
  [K in ReplayableTool]: (input: McpInput<K>, output: McpOutput<K>) => Promise<void>;
};

function requestIdOf(input: McpInput<McpToolName>) {
  return "requestId" in input ? input.requestId : undefined;
}

export async function executeAgentTool<K extends McpToolName>(
  db: DatabaseExecutor,
  identity: MessagingIdentity & { actorEntityId: string },
  tool: K,
  raw: WorkspaceApiRequest["input"],
) {
  const definition = mcpTools[tool];
  // SAFETY: `definition` is the registry entry for `tool`, so its schema produces McpInput<K>.
  const input = definition.input.parse(raw) as McpInput<K>;
  const output = await db.transaction(async (tx) => {
    const {
      context: ctx,
      actor: agent,
      userName,
    } = await workspaceContext(tx, identity, {
      lockActor: true,
    });
    const actor = { id: agent.entityId, name: agent.name, type: agent.type };
    const author = { actor: agent, authorName: agent.name };
    const tasks = taskRepository(ctx);
    const context = mcpContextQueries(ctx, identity);
    const queries = mcpTaskQueries(ctx, identity);
    const messaging = mcpMessagingQueries(ctx, identity);
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
      async create_task({ sourceMessageId, ...value }) {
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
            createdByActorEntityId: actor.id,
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
      async update_task({ taskId, changes }) {
        await tasks.update(taskId, { ...changes, assigneeActorEntityId: changes.assigneeActorId });
        return queries.getTask(taskId);
      },
      async add_task_comment(value) {
        const comment = await tasks.addComment(value.taskId, value.body);
        return { id: comment.id, taskId: value.taskId, createdAt: comment.createdAt };
      },
      async send_message(value) {
        const message = await sendMessageAs(ctx, identity, author, value);
        await recordRunReply(
          tx,
          { ...identity, agentActorEntityId: actor.id },
          { id: message.id, conversationId: message.conversationId, threadId: message.threadId },
        );
        return {
          id: message.id,
          conversationId: message.conversationId,
          threadId: message.threadId,
          createdAt: message.createdAt,
        };
      },
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
      async add_task_comment(value) {
        await tasks.get(value.taskId);
      },
      async send_message(_, previous) {
        await requireMessage(tx, identity, previous.id);
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
          Record<McpToolName, (input: McpInput<K>, output: McpOutput<K>) => Promise<void>>
        >
      )[tool];
      if (!recheck) throw new AccessDeniedError();
      await recheck(input, result);
    } else if (requestId)
      await tx.insert(agentToolRequests).values({
        organizationId: identity.organizationId,
        actorEntityId: actor.id,
        tool,
        requestId,
        fingerprint,
        result,
      });
    return result;
  });
  // SAFETY: input and output were parsed with the registry entry for the same tool.
  return { tool, input, output } as Extract<AgentToolExecution, { tool: K }>;
}
