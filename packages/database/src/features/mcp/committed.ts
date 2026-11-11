import type { TurnContext, WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";
import type { ServerToolName } from "@substrate/contracts/harness/tools";

import type { DatabaseExecutor } from "../../client";
import { commit } from "../../core/effects";
import type { SessionIdentity } from "../../core/session/identity";
import { executeAgentTool as execute } from "./service";

export function executeAgentTool<K extends ServerToolName>(
  db: DatabaseExecutor,
  identity: SessionIdentity & { actorEntityId: string },
  tool: K,
  raw: WorkspaceApiRequest["input"],
  turn: TurnContext,
) {
  return commit(db, (tx) => execute(tx, identity, tool, raw, turn));
}
