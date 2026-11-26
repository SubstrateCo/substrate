import type { AgentConfiguration } from "../agents/input.ts";
import type { AppId } from "../apps/index.ts";
import type { HarnessAgent, HarnessConfiguration } from "../harness-runtime/configuration.ts";
import { startupInstructions } from "./defaults.ts";
import { enabledStartupSkills, startupSkills } from "./skills/index.ts";
import { leaseTools } from "./tools/index.ts";

/** The agent fields that decide how the runtime runs it. */
export type RuntimeAgentDefinition = Pick<
  AgentConfiguration,
  "id" | "name" | "instructions" | "harness" | "model" | "enabled" | "useStartupDefaults"
>;

/**
 * An agent as the harness runtime runs it. With startup defaults, its instructions start with
 * Substrate's, the skills of its enabled apps are installed, and its sessions get the Substrate
 * tools of those apps.
 */
function harnessAgent(
  organizationId: string,
  agent: RuntimeAgentDefinition,
  enabledApps: readonly AppId[],
): HarnessAgent {
  const defaults = agent.useStartupDefaults;
  const installed = defaults ? enabledStartupSkills(enabledApps) : [];
  return {
    id: agent.id,
    harness: agent.harness,
    model: agent.model,
    enabled: agent.enabled,
    instructions: defaults
      ? `${startupInstructions({ ...agent, organizationId })}${agent.instructions}`
      : agent.instructions,
    managedSkills: startupSkills.map((skill) => ({
      ...skill,
      installed: installed.includes(skill),
    })),
    tools: defaults
      ? { main: leaseTools("main", enabledApps), helper: leaseTools("helper", enabledApps) }
      : null,
  };
}

/** The runtime configuration of an organization's agents. */
export function harnessConfiguration(input: {
  organizationId: string;
  agents: readonly RuntimeAgentDefinition[];
  enabledApps?: readonly AppId[];
}): HarnessConfiguration {
  return {
    organizationId: input.organizationId,
    agents: input.agents.map((agent) =>
      harnessAgent(input.organizationId, agent, input.enabledApps ?? []),
    ),
  };
}
