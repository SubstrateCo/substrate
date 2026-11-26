import type { TurnContext, WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";
import type { McpOutput, ServerToolName } from "@substrate/contracts/harness/tools";

import { executeAgentTool } from "../features/mcp/execution";
import type { FileContentReader } from "../features/mcp/files";
import { agentWorkFixture, callerFixture } from "./agent-work";
import type { setupDatabase } from "./database";

type Fixture = ReturnType<typeof setupDatabase>;
type AgentFixture = Awaited<ReturnType<typeof agentWorkFixture>>;

/** Calls the agent's tools through MCP dispatch, as the server does. */
function withTools(f: Fixture, base: AgentFixture, reader?: FileContentReader) {
  const execute = async (
    tool: ServerToolName,
    input: WorkspaceApiRequest["input"],
    turn: TurnContext,
  ) =>
    (
      await executeAgentTool(
        f.db,
        base.agentIdentity,
        tool,
        input,
        "installationId" in turn
          ? turn
          : { ...turn, installationId: base.agent.identity.installationId },
        reader,
      )
    ).result;
  /** Runs a call that does not wait for approval and returns its output. */
  const call = async <K extends ServerToolName>(
    tool: K,
    input: WorkspaceApiRequest["input"],
    turn: TurnContext,
  ) => {
    const execution = await execute(tool, input, turn);
    if ("pending" in execution) throw new Error(`${tool} waits for approval`);
    // SAFETY: execution parses its payload with the output schema registered for K.
    return execution.output as McpOutput<K>;
  };
  /** Makes a call that waits for approval and returns its proposal's request ID. */
  const pending = async (
    tool: ServerToolName,
    input: WorkspaceApiRequest["input"],
    turn: TurnContext,
  ) => {
    const execution = await execute(tool, input, turn);
    if (!("pending" in execution)) throw new Error(`${tool} ran without approval`);
    return execution.pending.requestId;
  };
  return { ...base, call, pending };
}

export async function mcpFixture(f: Fixture, reader?: FileContentReader) {
  return withTools(f, await agentWorkFixture(f), reader);
}

export async function mcpCallerFixture(f: Fixture, reader?: FileContentReader) {
  const base = await callerFixture(f);
  return { ...base, ...withTools(f, base, reader) };
}
