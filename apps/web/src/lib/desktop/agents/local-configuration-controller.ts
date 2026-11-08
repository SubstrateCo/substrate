import type { SaveSkillInput } from "@startup-os/contracts/agents";
import type { HarnessLocalConfiguration } from "@startup-os/contracts/harness";

type LocalAgentConfiguration = Pick<HarnessLocalConfiguration, "skills" | "mcpServers">;

// The desktop adapter owns native file scanning and writes. No cloud requests.
export interface LocalConfigurationController {
  scan(): Promise<LocalAgentConfiguration>;
  saveSkill(input: SaveSkillInput): Promise<void>;
  deleteSkill(id: string): Promise<void>;
  resetDefaults(): Promise<void>;
}
