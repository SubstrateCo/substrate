import type { TurnContext, WorkspaceApiRequest } from "@substrate/contracts/agent-tools/mcp";
import type { ServerToolName } from "@substrate/contracts/agent-tools/tools";

import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { commit } from "../../core/effects";
import type { DatabaseExecutor } from "../../core/executor";
import type { SessionIdentity } from "../../core/session/identity";
import type { FileContentReader } from "./files";
import { executeAgentToolInTransaction, parseAgentToolInput } from "./tool-execution";

/** The agent that calls, and the installation the call came from. */
type CallerIdentity = SessionIdentity & { actorEntityId: string; installationId?: string };

export async function executeAgentTool<K extends ServerToolName>(
  db: DatabaseExecutor,
  identity: CallerIdentity,
  tool: K,
  raw: WorkspaceApiRequest["input"],
  turn: TurnContext,
  reader?: FileContentReader,
) {
  const input = parseAgentToolInput(tool, raw);
  return commit(db, (tx) => executeAgentToolInTransaction(tx, identity, tool, input, turn, reader));
}

/** Runs a call for the owner's agent, provisioning the agent's actor in this organization. */
export async function executeUserAgentTool<K extends ServerToolName>(
  db: DatabaseExecutor,
  owner: SessionIdentity & { userAgentId: string; installationId?: string },
  tool: K,
  raw: WorkspaceApiRequest["input"],
  turn: TurnContext,
  reader?: FileContentReader,
) {
  const { organizationId, userId, installationId } = owner;
  const actor = await ensureUserAgentActor(db, owner);
  return executeAgentTool(
    db,
    { organizationId, userId, actorEntityId: actor.entityId, installationId },
    tool,
    raw,
    turn,
    reader,
  );
}
