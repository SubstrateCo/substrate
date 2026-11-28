export const agentViews = ["messages", "work"] as const;
export type AgentView = (typeof agentViews)[number];

export const agentSettingsPages = ["overview", "routines", "skills", "mcps"] as const;
export type AgentSettingsPage = (typeof agentSettingsPages)[number];

export const agentSettingsPageLabels: Record<AgentSettingsPage, string> = {
  overview: "Settings",
  routines: "Routines",
  skills: "Skills",
  mcps: "MCP servers",
};
