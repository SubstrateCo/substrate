/** The settings sections of an agent. Name, model, and instructions share one draft. */
export const agentSettingsSections = ["general", "instructions", "skills", "mcps", "run"] as const;
export type AgentSettingsSection = (typeof agentSettingsSections)[number];

/** Every section of an agent's page. Activity is the default and has no search value. */
export const agentPageSections = ["routines", "calls", ...agentSettingsSections] as const;
export type AgentPageSection = "activity" | (typeof agentPageSections)[number];

export const agentSectionLabels: Record<AgentSettingsSection, string> = {
  general: "General",
  instructions: "Instructions",
  skills: "Skills",
  mcps: "MCP servers",
  run: "Run settings",
};

/** "General and Run settings": the sections a draft touches, for copy. */
export function listSections(sections: readonly AgentSettingsSection[]) {
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(
    sections.map((section) => agentSectionLabels[section]),
  );
}

export function isAgentSettingsSection(value: unknown): value is AgentSettingsSection {
  return agentSettingsSections.some((section) => section === value);
}
