import type { AgentSection } from "../editors/agent-form";

/** The copy of the skills and MCP servers sections, shared with their loading views. */
export const configurationSections: Record<
  AgentSection,
  { title: string; description: string; listTitle: string }
> = {
  skills: {
    title: "Skills",
    description:
      "How-to guides the agent opens when a task matches. Each skill is a file in its folder on its desktop.",
    listTitle: "Your skills",
  },
  mcps: {
    title: "MCP servers",
    description:
      "Tool servers this agent can use. Substrate keeps them on its desktop and gives them to the agent at the start of each session.",
    listTitle: "Your servers",
  },
};
