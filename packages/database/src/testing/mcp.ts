import type { WorkspaceApiRequest } from "@substrate/contracts/agent-tools/mcp";
import type { McpOutput, ServerToolName } from "@substrate/contracts/agent-tools/tools";

import { executeAgentTool } from "../features/mcp/execution";
import type { FileContentReader } from "../features/mcp/files";
import { agentWorkFixture } from "./agent-work";
import type { setupDatabase } from "./database";
import { callerOf, type TurnSpec } from "./turns";

type Fixture = ReturnType<typeof setupDatabase>;
type AgentFixture = Awaited<ReturnType<typeof agentWorkFixture>>;

function withTools(f: Fixture, base: AgentFixture, reader?: FileContentReader) {
  const execute = async (
    tool: ServerToolName,
    input: WorkspaceApiRequest["input"],
    spec: TurnSpec,
  ) =>
    (
      await executeAgentTool(
        f.db,
        {
          ...base.agentIdentity,
          installationId: callerOf(spec, base.agent.identity.installationId),
        },
        tool,
        input,
        await base.turn(spec),
        reader,
      )
    ).result;
  const call = async <K extends ServerToolName>(
    tool: K,
    input: WorkspaceApiRequest["input"],
    spec: TurnSpec,
  ) => {
    const execution = await execute(tool, input, spec);
    if ("pending" in execution) throw new Error(`${tool} waits for approval`);
    // SAFETY: execution parses its payload with the output schema registered for K.
    return execution.output as McpOutput<K>;
  };
  const pending = async (
    tool: ServerToolName,
    input: WorkspaceApiRequest["input"],
    spec: TurnSpec,
  ) => {
    const execution = await execute(tool, input, spec);
    if (!("pending" in execution)) throw new Error(`${tool} ran without approval`);
    return execution.pending.requestId;
  };
  return { ...base, call, pending };
}

export async function mcpFixture(f: Fixture, reader?: FileContentReader) {
  return withTools(f, await agentWorkFixture(f), reader);
}
