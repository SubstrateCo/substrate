import type { AgentConfiguration } from "../agents/input.ts";
import type { AppId } from "../apps/index.ts";
import type { HarnessAgent, HarnessConfiguration } from "../harness-runtime/configuration.ts";
import { startupInstructions } from "./defaults.ts";
import { enabledStartupSkills, startupSkills } from "./skills/index.ts";
import { leaseTools } from "./tools/index.ts";

/** The agent fields that decide how the runtime runs it. */
export type RuntimeAgentDefinition = Pick<
  AgentConfiguration,
  | "id"
  | "name"
  | "instructions"
  | "harness"
  | "model"
  | "enabled"
  | "disabledApps"
  | "substrateGuide"
>;

/** The organization's enabled apps, without the ones the agent goes without. */
export function agentApps(
  enabledApps: readonly AppId[],
  agent: Pick<AgentConfiguration, "disabledApps">,
): AppId[] {
  return enabledApps.filter((app) => !agent.disabledApps.some((disabled) => disabled === app));
}

function harnessAgent(
  organizationId: string,
  agent: RuntimeAgentDefinition,
  enabledApps: readonly AppId[],
): HarnessAgent {
  const apps = agentApps(enabledApps, agent);
  const installed = enabledStartupSkills(apps);
  return {
    id: agent.id,
    harness: agent.harness,
    model: agent.model,
    enabled: agent.enabled,
    instructions: agent.substrateGuide
      ? `${startupInstructions({ ...agent, organizationId }, apps)}${agent.instructions}`
      : agent.instructions,
    managedSkills: startupSkills.map((skill) => ({
      ...skill,
      installed: installed.includes(skill),
    })),
    tools: { main: leaseTools("main", apps), helper: leaseTools("helper", apps) },
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
