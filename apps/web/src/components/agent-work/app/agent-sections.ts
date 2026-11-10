/** The settings sections of an agent. Name, model, and instructions share one draft. */
const agentSettingsSections = ["general", "instructions", "skills", "mcps", "run"] as const;
export type AgentSettingsSection = (typeof agentSettingsSections)[number];

/** Every section of an agent's page. Activity is the default and has no search value. */
export const agentPageSections = ["routines", ...agentSettingsSections] as const;
export type AgentPageSection = "activity" | (typeof agentPageSections)[number];

export function isAgentSettingsSection(value: unknown): value is AgentSettingsSection {
  return agentSettingsSections.some((section) => section === value);
}
