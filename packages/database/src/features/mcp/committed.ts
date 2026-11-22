import type { TurnContext, WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";
import { mcpTools, type ServerToolName } from "@substrate/contracts/harness/tools";

import { commit } from "../../core/effects";
import type { DatabaseExecutor } from "../../core/executor";
import type { SessionIdentity } from "../../core/session/identity";
import { auditFailedCallerTool, namedIds } from "./caller-turn";
import { executeAgentToolInTransaction, parseAgentToolInput } from "./service";

export async function executeAgentTool<K extends ServerToolName>(
  db: DatabaseExecutor,
  identity: SessionIdentity & { actorEntityId: string },
  tool: K,
  raw: WorkspaceApiRequest["input"],
  turn: TurnContext,
) {
  try {
    const input = parseAgentToolInput(tool, raw);
    return await commit(db, (tx) => executeAgentToolInTransaction(tx, identity, tool, input, turn));
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
