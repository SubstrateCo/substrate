/** What the agent page shows: its direct conversation, or its work. Messages is the default. */
export const agentViews = ["messages", "work"] as const;
export type AgentView = (typeof agentViews)[number];

/**
 * The pages of the settings sheet. The overview holds every setting and a summary of each
 * collection; routines, skills, and MCP servers open as full lists inside the sheet.
 */
export const agentSettingsPages = ["overview", "routines", "skills", "mcps"] as const;
export type AgentSettingsPage = (typeof agentSettingsPages)[number];

export const agentSettingsPageLabels: Record<AgentSettingsPage, string> = {
  overview: "Settings",
  routines: "Routines",
  skills: "Skills",
  mcps: "MCP servers",
};
