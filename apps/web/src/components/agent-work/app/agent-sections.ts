/** The settings sections of an agent. Name, model, and instructions share one draft. */
export const agentSettingsSections = ["general", "instructions", "skills", "mcps", "run"] as const;
export type AgentSettingsSection = (typeof agentSettingsSections)[number];

export const agentConversationSections = ["messages", "activity", "routines", "calls"] as const;
export type AgentConversationSection = (typeof agentConversationSections)[number];

/** Messages is the default. Settings sections share one Settings tab. */
export const agentPageSections = [...agentConversationSections, ...agentSettingsSections] as const;
export type AgentPageSection = (typeof agentPageSections)[number];

export const agentSectionLabels: Record<AgentSettingsSection, string> = {
  general: "General",
  instructions: "Instructions",
  skills: "Skills",
  mcps: "MCP servers",
  run: "Run settings",
};

const sectionListFormatter = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/** "General and Run settings": the sections a draft touches, for copy. */
export function listSections(sections: readonly AgentSettingsSection[]) {
  return sectionListFormatter.format(sections.map((section) => agentSectionLabels[section]));
}

export function isAgentSettingsSection(value: unknown): value is AgentSettingsSection {
  return agentSettingsSections.some((section) => section === value);
}
