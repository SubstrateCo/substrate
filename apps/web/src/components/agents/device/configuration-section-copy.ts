import type { AgentSection } from "../editors/agent-form";

/** The copy of the skills and MCP servers sections, shared with their loading views. */
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

/** Whether a skill or server matches the search, by its name or detail, ignoring case. */
export function matchesSearch(query: string, ...fields: (string | undefined)[]) {
  const needle = query.trim().toLowerCase();
  return !needle || fields.some((field) => field?.toLowerCase().includes(needle));
}
