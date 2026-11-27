import { startupSkillIds } from "@substrate/contracts/agent-tools";
import type { AgentConfiguration } from "@substrate/contracts/agents";

import { useQuery } from "@tanstack/react-query";

import { ToolsSummaryView, type ToolSummary } from "./tools-summary-view";
import { openingName } from "@/components/agents/editors/skill-name";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import {
  localAgentConfiguration,
  localConfigurationOptions,
} from "@/queries/agents/local-configuration";

const named = (names: string[]) => {
  const shown = names.slice(0, 3).join(", ");
  const more = names.length > 3 ? ` and ${names.length - 3} more` : "";
  return names.length ? `${shown}${more}` : "None";
};

/**
 * Counts the agent's skills and servers from its files. Only its home desktop can read them;
 * elsewhere the counts are unknown.
 */
export function ToolsSummary({
  agent,
  homeDevice,
  onOpen,
}: {
  agent: AgentConfiguration;
  homeDevice: { name: string; current: boolean } | null;
  onOpen: (page: "skills" | "mcps") => void;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const local = localAgentConfiguration(
    userId,
    organizationId,
    agent.id,
    agent.harness,
    !!homeDevice?.current,
  );
  const configuration = useQuery(localConfigurationOptions(userId, local));
  const elsewhere: ToolSummary = { detail: "" };
  let skills = elsewhere;
  let servers = elsewhere;
  if (local && !configuration.data) {
    const reading = {
      detail: configuration.error
        ? "Couldn’t read this agent’s files"
        : "Reading this agent’s files",
    };
    skills = reading;
    servers = reading;
  } else if (configuration.data) {
    const own = configuration.data.skills.filter((skill) => !startupSkillIds.includes(skill.id));
    skills = {
      detail: named(own.map((skill) => openingName(skill))),
      count: own.length,
    };
    servers = {
      detail: named(configuration.data.mcpServers.map((server) => server.name)),
      count: configuration.data.mcpServers.length,
    };
  }
  return <ToolsSummaryView skills={skills} servers={servers} onOpen={onOpen} />;
}
