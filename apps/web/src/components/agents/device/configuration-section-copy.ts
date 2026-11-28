import type { AgentSection } from "../editors/agent-form";

export const configurationSections: Record<
  AgentSection,
  { listTitle: string; description: string }
> = {
  skills: {
    listTitle: "Custom skills",
    description: "Your own instructions. Catalog updates never change these.",
  },
  mcps: {
    listTitle: "Your servers",
    description: "Tools and data the agent can reach through MCP.",
  },
};

export function matchesSearch(query: string, ...fields: (string | undefined)[]) {
  const needle = query.trim().toLowerCase();
  return !needle || fields.some((field) => field?.toLowerCase().includes(needle));
}
