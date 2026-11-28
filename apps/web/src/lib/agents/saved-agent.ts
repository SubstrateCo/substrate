import type { AgentConfiguration, SaveAgentInput } from "@substrate/contracts/agents";

export function savedAgentInput(
  agent: AgentConfiguration,
  changes: Partial<Pick<SaveAgentInput, "enabled" | "disabledApps" | "substrateGuide">>,
): SaveAgentInput {
  return {
    id: agent.id,
    name: agent.name,
    instructions: agent.instructions,
    harness: agent.harness,
    model: agent.model,
    enabled: agent.enabled,
    disabledApps: agent.disabledApps,
    substrateGuide: agent.substrateGuide,
    ...changes,
  };
}
