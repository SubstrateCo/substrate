import type { TurnContext, WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";
import type { McpOutput, ServerToolName } from "@substrate/contracts/harness/tools";

import {
  agentWorkFixture as persistenceFixture,
  callerFixture as persistenceCallerFixture,
} from "../../../../../packages/database/src/testing/agent-work";
import type { setupDatabase } from "../../../../../packages/database/src/testing/database";
import { executeAgentTool } from "./execution";

type Fixture = ReturnType<typeof setupDatabase>;
type AgentFixture = Awaited<ReturnType<typeof persistenceFixture>>;

function withTools(f: Fixture, base: AgentFixture) {
  const call = async <K extends ServerToolName>(
    tool: K,
    input: WorkspaceApiRequest["input"],
    turn: TurnContext,
  ) => {
    const execution = await executeAgentTool(
      f.db,
      base.agentIdentity,
      tool,
      input,
      "installationId" in turn
        ? turn
        : { ...turn, installationId: base.agent.identity.installationId },
    );
    // SAFETY: execution parses its payload with the output schema registered for K.
    return execution.result.output as McpOutput<K>;
  };
  return { ...base, call };
}

export async function agentWorkFixture(f: Fixture) {
  return withTools(f, await persistenceFixture(f));
}

export async function callerFixture(f: Fixture) {
  const base = await persistenceCallerFixture(f);
  return { ...base, ...withTools(f, base) };
}
