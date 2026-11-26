import type { TurnContext, WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";
import { mcpTools, type ServerToolName } from "@substrate/contracts/harness/tools";

import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { commit } from "../../core/effects";
import type { DatabaseExecutor } from "../../core/executor";
import type { SessionIdentity } from "../../core/session/identity";
import { auditFailedCallerTool, namedIds } from "./caller-turn";
import type { FileContentReader } from "./files";
import { executeAgentToolInTransaction, parseAgentToolInput } from "./tool-execution";

export async function executeAgentTool<K extends ServerToolName>(
  db: DatabaseExecutor,
  identity: SessionIdentity & { actorEntityId: string },
  tool: K,
  raw: WorkspaceApiRequest["input"],
  turn: TurnContext,
  reader?: FileContentReader,
) {
  try {
    const input = parseAgentToolInput(tool, raw);
    return await commit(db, (tx) =>
      executeAgentToolInTransaction(tx, identity, tool, input, turn, reader),
    );
  } catch (error) {
    // The call's transaction rolled back. A turn that answers callers still logs the failure;
    // a failed log does not hide the call's own error.
    if (turn.invocationIds?.length && error instanceof Error)
      await auditFailedCallerTool(db, identity, turn, {
        tool,
        readOnly: mcpTools[tool].readOnly,
        targetIds: namedIds(JSON.stringify(raw)),
        error,
      }).catch(() => undefined);
    throw error;
  }
}

/** Runs a call for the owner's agent, provisioning the agent's actor in this organization. */
export async function executeUserAgentTool<K extends ServerToolName>(
  db: DatabaseExecutor,
  owner: SessionIdentity & { userAgentId: string },
  tool: K,
  raw: WorkspaceApiRequest["input"],
  turn: TurnContext,
  reader?: FileContentReader,
) {
  const { organizationId, userId } = owner;
  const actor = await ensureUserAgentActor(db, owner);
  return executeAgentTool(
    db,
    { organizationId, userId, actorEntityId: actor.entityId },
    tool,
    raw,
    turn,
    reader,
  );
}
