import type { AgentSection } from "../editors/agent-form";

/** The copy of the skills and MCP servers sections, shared with their loading views. */
export const configurationSections: Record<
  AgentSection,
  { description: string; listTitle: string }
> = {
  skills: {
    description:
      "How-to guides the agent opens when a task matches. Each skill is a file in its folder on its desktop.",
    listTitle: "Your skills",
  },
  mcps: {
    description:
      "Tool servers this agent can use. Substrate keeps them on its desktop and gives them to the agent at the start of each session.",
    listTitle: "Your servers",
  },
};

/** What the Substrate skills list shows, for its group's description. */
export const startupSkillsDescription = (scanned: boolean) =>
  scanned
    ? "Read from this agent’s local files. Substrate updates these skills on sync."
    : "Default skill definitions. Open the desktop app to inspect this agent’s local files.";

/** Whether a skill or server matches the search, by its name or detail, ignoring case. */
export function matchesSearch(query: string, ...fields: (string | undefined)[]) {
  const needle = query.trim().toLowerCase();
  return !needle || fields.some((field) => field?.toLowerCase().includes(needle));
}
