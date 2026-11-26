import {
  canonicalJson,
  proposalAction,
  proposalTargetBasis,
  staleProposalError,
  type ProposalAction,
  type ProposalOutcome,
  type ProposalTargetBasis,
} from "@substrate/contracts/agent-work";
import { isOptionalApp } from "@substrate/contracts/apps";
import {
  mcpCall,
  mcpTools,
  toolApps,
  type McpInput,
  type ServerToolName,
  type ToolDefinition,
} from "@substrate/contracts/harness/tools";

import { requireAppsEnabled } from "../../../core/apps/access";
import { deletableAuthors, requireInteraction } from "../../../core/contacts/access";
import { entities } from "../../../core/entities/schema";
import type { RepositoryContext } from "../../../core/repository-context";
import type { SessionIdentity } from "../../../core/session/identity";
import { messageReferences } from "../../../core/text/references";
import { AccessDeniedError, ConflictError, ValidationError } from "../../../errors";
import { serverToolHandlers } from "../../mcp/handlers";
import { requireMessage } from "../../messaging/access";
import { messagingConversations, messagingMessages } from "../../messaging/schema";
import { projectRepository } from "../../projects/repository";
import { tasks } from "../../tasks/tasks.schema";
import { requirePlace } from "../place";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

type Agent = Parameters<typeof serverToolHandlers>[2];
type Receipt = Extract<ProposalOutcome, { status: "executed" }>["receipt"];
type ActionInput = ProposalAction["input"];

const serverToolName = mcpCall.shape.tool;
// A quoted UUID in JSON text: a string value that is exactly one ID.
const quotedUuid = /"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi;

/**
 * The server tool, if a call of it can wait for the owner and run later without the turn.
 * Reads never need approval. A live-turn-only tool shares data at its owner's request, so it
 * cannot wait.
 */
export function proposableTool(tool: string): ServerToolName | null {
  const parsed = serverToolName.safeParse(tool);
  if (!parsed.success) return null;
  const name = parsed.data;
  const definition: ToolDefinition = mcpTools[name];
  return !definition.readOnly && !definition.liveTurnOnly ? name : null;
}

/** The stored call input: the parsed input as JSON, without the call's own requestId. */
export function proposalInput(input: McpInput<ServerToolName>): ActionInput {
  const { requestId: _, ...rest } = proposalAction.shape.input.parse(
    JSON.parse(JSON.stringify(input)),
  );
  return rest;
}

/**
 * Parses a stored call input with the tool's schema. A tool with requestId gets `requestId`,
 * which keys the call's idempotent writes; other tools' schemas reject or strip the extra key.
 */
function parseInput(tool: ServerToolName, input: ActionInput, requestId: string) {
  const schema: ToolDefinition["input"] = mcpTools[tool].input;
  const keyed = schema.safeParse({ ...input, requestId });
  const parsed = keyed.success ? keyed.data : schema.parse(input);
  // SAFETY: the schema is the registry entry for `tool`, so it produces McpInput<typeof tool>.
  return parsed as McpInput<ServerToolName>;
}

// Every ID the input names, at any depth.
function namedUuids(input: ActionInput) {
  return new Set([...canonicalJson(input).matchAll(quotedUuid)].map(([, id]) => id!.toLowerCase()));
}

// The entity's version: the time of its last change, to the millisecond.
async function readableVersion(ctx: RepositoryContext, entityId: string) {
  return (await ctx.requireAccess(entityId, "view")).entity;
}

// Checks the agent can read each named record, and returns the version of each entity and the
// audience of each conversation. Messages and people are checked but not bound: a message does
// not change what the call does, and a person's grants are checked again when the call runs.
// Other IDs, such as a pipeline stage or a task link, name parts of a bound record; the tool
// checks them inside it.
async function namedTargets(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  ids: Set<string>,
): Promise<ProposalTargetBasis> {
  const basis: ProposalTargetBasis = { entities: {}, conversations: {} };
  let rest = [...ids];
  if (!rest.length) return basis;
  const named = await ctx.db
    .select({
      entityId: entities.entityId,
      organizationId: entities.organizationId,
      entityType: entities.entityType,
    })
    .from(entities)
    .where(inArray(entities.entityId, rest));
  for (const entity of named) {
    if (entity.organizationId !== ctx.scope.organizationId) throw new AccessDeniedError();
    if (entity.entityType === "actor") await ctx.requireActiveActor(entity.entityId);
    else
      basis.entities[entity.entityId] = (
        await readableVersion(ctx, entity.entityId)
      ).updatedAt.toISOString();
  }
  rest = rest.filter((id) => !named.some((entity) => entity.entityId === id));
  if (!rest.length) return basis;
  const conversations = await ctx.db
    .select({
      id: messagingConversations.id,
      kind: messagingConversations.kind,
      private: messagingConversations.private,
    })
    .from(messagingConversations)
    .where(inArray(messagingConversations.id, rest));
  for (const { id, ...audience } of conversations) {
    await requirePlace(ctx.db, identity, { conversationId: id });
    basis.conversations[id] = audience;
  }
  rest = rest.filter((id) => !conversations.some((conversation) => conversation.id === id));
  if (!rest.length) return basis;
  const messages = await ctx.db
    .select({ id: messagingMessages.id })
    .from(messagingMessages)
    .where(inArray(messagingMessages.id, rest));
  for (const { id } of messages) {
    const { conversation } = await requireMessage(ctx.db, identity, id);
    if (conversation.organizationId !== identity.organizationId) throw new AccessDeniedError();
  }
  return basis;
}

// Cheap checks that fail a proposal which could never run, before the owner sees it. The tool
// checks everything again when it runs.
async function precheck(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  tool: ServerToolName,
  input: ActionInput,
) {
  const requestId = crypto.randomUUID();
  if (tool === "reply") {
    const reply = mcpTools.reply.input.parse({ ...input, requestId });
    if (!reply.to) throw new ValidationError("Reply to the turn's own place without approval.");
    if (reply.ask)
      throw new ValidationError("Background work cannot ask your owner. Reply without ask.");
    messageReferences(reply.body);
    await requirePlace(ctx.db, identity, reply.to);
  } else if (tool === "delete_task") {
    const { taskId } = mcpTools.delete_task.input.parse({ ...input, requestId });
    await ctx.requireAccess(taskId, "edit", { type: "task" });
  } else if (tool === "delete_project") {
    const { projectId } = mcpTools.delete_project.input.parse({ ...input, requestId });
    await ctx.requireAccess(projectId, "owner", { type: "project" });
    if (!(await projectRepository(ctx).get(projectId)).archivedAt)
      throw new ValidationError("Archive the project first.");
  } else if (tool === "delete_crm_interaction") {
    const { entityId } = mcpTools.delete_crm_interaction.input.parse({ ...input, requestId });
    const { interaction } = await requireInteraction(ctx, entityId);
    const author = interaction.createdByActorEntityId;
    if (!(await deletableAuthors(ctx, [author])).has(author)) throw new AccessDeniedError();
  } else parseInput(tool, input, requestId);
}
/**
 * Checks that the agent may propose the call now and returns the state of the records it names.
 * The tool must be a server write that can run without the turn, its apps must be enabled, and
 * every record it names must be readable: a proposal never names a hidden record. Execution
 * checks again through the tool itself.
 */
export async function checkProposalAccess(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  action: ProposalAction,
): Promise<ProposalTargetBasis> {
  const tool = proposableTool(action.tool);
  if (!tool) throw new ValidationError("This tool cannot wait for approval.");
  if (Object.hasOwn(action.input, "requestId")) throw new ValidationError("Invalid proposal.");
  await requireAppsEnabled(ctx, toolApps(tool).filter(isOptionalApp));
  await precheck(ctx, identity, tool, action.input);
  return namedTargets(ctx, identity, namedUuids(action.input));
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

function bindConversation(
  ctx: RepositoryContext,
  id: string,
  audience: ProposalTargetBasis["conversations"][string],
) {
  return bindTarget(
    ctx.db
      .update(messagingConversations)
      .set({ version: sql`${messagingConversations.version}` })
      .where(
        and(
          eq(messagingConversations.id, id),
          eq(messagingConversations.kind, audience.kind),
          eq(messagingConversations.private, audience.private),
        ),
      )
      .returning({ id: messagingConversations.id }),
  );
}

// Binds every named record to the state that was proposed, in the call's transaction.
async function bindTargets(ctx: RepositoryContext, basis: ProposalTargetBasis) {
  for (const [id, version] of Object.entries(basis.entities)) await bindWork(ctx, id, version);
  for (const [id, audience] of Object.entries(basis.conversations))
    await bindConversation(ctx, id, audience);
}

const deletions = new Map<
  ServerToolName,
  [Extract<Receipt, { kind: "deleted" }>["entityType"], "taskId" | "projectId" | "entityId"]
>([
  ["delete_task", ["task", "taskId"]],
  ["delete_project", ["project", "projectId"]],
  ["delete_crm_interaction", ["contact_interaction", "entityId"]],
]);

const optionalId = z.uuid().optional().catch(undefined);
// The record a call created or changed: named by its output, else by its input.
const outputRecord = z.object({
  record: z.object({ entityId: optionalId }).optional().catch(undefined),
  entityId: optionalId,
  id: optionalId,
});
const inputRecord = z.object({
  entityId: optionalId,
  taskId: optionalId,
  projectId: optionalId,
  contactEntityId: optionalId,
});

/**
 * The receipt of an executed call: the message it posted, or the record it created or changed,
 * so the owner can open it. A deletion names what it deleted. Other calls name only the tool.
 */
async function receiptFor(
  ctx: RepositoryContext,
  tool: ServerToolName,
  input: ActionInput,
  output: z.output<ReturnType<typeof z.json>>,
): Promise<Receipt> {
  const deletion = deletions.get(tool);
  if (deletion) {
    const [entityType, key] = deletion;
    const id = optionalId.parse(input[key]);
    if (id) return { kind: "deleted", entityType, id };
  }
  const definition: ToolDefinition = mcpTools[tool];
  const message = definition.publishes?.find((entry) => entry.kind === "message");
  if (message) {
    const posted = z
      .object({
        [message.id]: z.uuid(),
        [message.conversationId]: z.uuid(),
        [message.threadId]: z.uuid().nullable(),
      })
      .safeParse(output);
    if (posted.success)
      return {
        kind: "message",
        id: posted.data[message.id]!,
        conversationId: posted.data[message.conversationId]!,
        threadId: posted.data[message.threadId] ?? null,
      };
  }
  const named = outputRecord.parse(output);
  const given = inputRecord.parse(input);
  const id =
    named.record?.entityId ??
    named.entityId ??
    named.id ??
    given.entityId ??
    given.taskId ??
    given.projectId ??
    given.contactEntityId;
  if (!id) return { kind: "done", tool };
  const [record] = await ctx.db
    .select({ entityType: entities.entityType, projectId: tasks.projectEntityId })
    .from(entities)
    .leftJoin(
      tasks,
      and(eq(tasks.organizationId, entities.organizationId), eq(tasks.entityId, entities.entityId)),
    )
    .where(and(eq(entities.organizationId, ctx.scope.organizationId), eq(entities.entityId, id)));
  if (!record) return { kind: "done", tool };
  const { entityType, projectId } = record;
  if (entityType === "task" && projectId) return { kind: "task", id, projectId };
  if (entityType === "project") return { kind: "project", id };
  if (entityType === "account" || entityType === "contact" || entityType === "deal")
    return { kind: "crm", entityType, id };
  return { kind: "done", tool };
}

/**
 * Runs exactly the approved call as the agent, only while the records it names are as they
 * were proposed. Access is checked again and the records are bound to that state before the
 * tool runs. The caller's claim on the request makes the call run once, and the request ID keys
 * the call's idempotent writes, so the same proposal cannot post twice. Returns the receipt and
 * the tool's output, as the call would have returned it.
 */
export async function runProposalAction(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  agent: Agent,
  proposal: { id: string; turnId: string; action: ProposalAction; targetBasis: unknown },
) {
  const { action } = proposal;
  const current = await checkProposalAccess(ctx, identity, action);
  const proposed = proposalTargetBasis.safeParse(proposal.targetBasis);
  if (!proposed.success || canonicalJson(proposed.data) !== canonicalJson(current))
    throw new ConflictError(staleProposalError);
  await bindTargets(ctx, proposed.data);
  const tool = proposableTool(action.tool);
  if (!tool) throw new ValidationError("This tool cannot wait for approval.");
  const handlers = serverToolHandlers(ctx, identity, agent, {
    kind: "proposal",
    id: proposal.id,
    turnId: proposal.turnId,
  });
  // SAFETY: parseInput parses with the registry entry for `tool`, the input this handler takes.
  const handler = handlers[tool] as (input: McpInput<ServerToolName>) => Promise<object>;
  const result = await handler(parseInput(tool, action.input, proposal.id));
  // The output crosses the tool's output schema, as the call's own result would.
  const output = z
    .json()
    .parse(
      JSON.parse(JSON.stringify(mcpTools[tool].output.parse(JSON.parse(JSON.stringify(result))))),
    );
  return { receipt: await receiptFor(ctx, tool, action.input, output), output };
}
