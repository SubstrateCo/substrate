import type { AgentWorkRuntime } from "@substrate/agent-host";
import { channel, methods } from "@substrate/contracts/agent-work/ipc";
import { handleBridge, type IpcValue } from "@substrate/contracts/desktop/ipc";

export async function dispatchAgentWork(
  runtime: Pick<AgentWorkRuntime, "turnEvents" | "turnRuns" | "homedAgents">,
  method: string,
  value?: IpcValue,
) {
  return handleBridge(channel, methods, {
    turnEvents: (input) => runtime.turnEvents(...input),
    turnRuns: (input) => runtime.turnRuns(input),
    homedAgents: () => runtime.homedAgents(),
  })(method, value);
}
