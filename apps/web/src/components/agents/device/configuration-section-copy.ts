import type { AgentSection } from "../editors/agent-form";

/** The copy of the skills and MCP servers sections, shared with their loading views. */
export const configurationSections: Record<AgentSection, { listTitle: string }> = {
  skills: {
    listTitle: "Your skills",
  },
  mcps: {
    listTitle: "Your servers",
  },
};

/** Whether a skill or server matches the search, by its name or detail, ignoring case. */
export function matchesSearch(query: string, ...fields: (string | undefined)[]) {
  const needle = query.trim().toLowerCase();
  return !needle || fields.some((field) => field?.toLowerCase().includes(needle));
}
