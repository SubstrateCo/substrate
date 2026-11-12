import { invocationMachine } from "@substrate/contracts/agent-work";
import type { TurnContext } from "@substrate/contracts/harness/mcp";

import type { DatabaseExecutor } from "../../client";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { audit } from "../agent-work/audit";
import { agentInvocations } from "../agent-work/invocations.schema";
import { and, eq, inArray } from "drizzle-orm";

type Agent = SessionIdentity & { actorEntityId: string };
type CallRow = typeof agentInvocations.$inferSelect;

function callsOf(db: DatabaseExecutor, identity: Agent, ids: string[]) {
  return db
    .select()
    .from(agentInvocations)
    .where(
      and(
        inArray(agentInvocations.id, ids),
        eq(agentInvocations.agentActorEntityId, identity.actorEntityId),
        eq(agentInvocations.ownerUserId, identity.userId),
        eq(agentInvocations.organizationId, identity.organizationId),
      ),
    );
}

/**
 * Checks the calls a turn says it answers: each is an admitted call of this agent and owner, and
 * its message is in the turn's place. A turn without calls has none to check.
 */
export async function requireCallerTurn(db: DatabaseExecutor, identity: Agent, turn: TurnContext) {
  const ids = [...new Set(turn.invocationIds ?? [])];
  if (!ids.length) return [];
  const rows = await callsOf(db, identity, ids);
  if (rows.length !== ids.length) throw new AccessDeniedError();
  for (const row of rows) {
    if (row.status !== invocationMachine.events.admit.to)
      throw new ValidationError("A call of this turn may not run any more.");
    const place = turn.origin;
    if (
      place?.conversationId !== row.conversationId ||
      place.threadId !== (row.threadId ?? row.messageId)
    )
      throw new ValidationError("A call of this turn is not in the turn's place.");
  }
  return rows;
}

const resultCodes: [new (...args: never[]) => Error, string][] = [
  [AccessDeniedError, "access_denied"],
  [ValidationError, "invalid"],
  [ConflictError, "conflict"],
];

// An ID field of a serialized tool input or result, such as "taskId":"<uuid>". The idempotency
// requestId is not a record.
const idField = /"(id|\w+Id)":"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi;

/**
 * The record IDs that a serialized tool input or result names, such as taskId,
 * to.conversationId, or a created message's ID. Never text.
 */
export function namedIds(json: string) {
  return [...json.matchAll(idField)].flatMap(([, key, id]) =>
    key === "requestId" || !id ? [] : [id],
  );
}

/**
 * Records one MCP call in a turn that answers callers, once per call it answers: the tool, read
 * or write, the IDs it named and returned, and the result code. Never inputs or bodies.
 */
export async function auditCallerTool(
  db: DatabaseExecutor,
  calls: CallRow[],
  entry: {
    tool: string;
    readOnly: boolean;
    turnId: string;
    /** IDs of the input and, for a success, of the result: see namedIds. */
    targetIds: string[];
    /** Absent for a success. */
    error?: Error;
  },
) {
  const { error } = entry;
  const result = error
    ? (resultCodes.find(([type]) => error instanceof type)?.[1] ?? "error")
    : "ok";
  await audit(
    db,
    calls.map((call) => ({
      organizationId: call.organizationId,
      userAgentId: call.userAgentId,
      ownerUserId: call.ownerUserId,
      action: "mcp_call" as const,
      invocationId: call.id,
      callerUserId: call.callerUserId,
      tool: entry.tool,
      access: entry.readOnly ? ("read" as const) : ("write" as const),
      targetIds: [...new Set(entry.targetIds)],
      result,
      turnId: entry.turnId,
    })),
  );
}

/**
 * Records a failed MCP call of a caller turn after its transaction rolled back. Only calls of
 * this agent and owner are recorded; unknown IDs are ignored.
 */
export async function auditFailedCallerTool(
  db: DatabaseExecutor,
  identity: Agent,
  turn: TurnContext,
  entry: { tool: string; readOnly: boolean; targetIds: string[]; error: Error },
) {
  const ids = [...new Set(turn.invocationIds ?? [])];
  if (!ids.length) return;
  const calls = await callsOf(db, identity, ids);
  await auditCallerTool(db, calls, { ...entry, turnId: turn.turnId });
}
