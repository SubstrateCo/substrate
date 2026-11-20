import type { SaveSkillInput } from "@substrate/contracts/agents";
import type { HarnessLocalConfiguration, HarnessMcpServer } from "@substrate/contracts/harness";

type LocalAgentConfiguration = Pick<HarnessLocalConfiguration, "skills" | "mcpServers">;

// The desktop adapter owns local skill files and MCP servers. No cloud requests.
export interface LocalConfigurationController {
  scan(): Promise<LocalAgentConfiguration>;
  saveSkill(input: SaveSkillInput): Promise<void>;
  deleteSkill(id: string): Promise<void>;
  resetDefaults(): Promise<void>;
  /** Adds or replaces a user-added MCP server in Substrate's local storage. */
  saveMcpServer(server: HarnessMcpServer): Promise<void>;
  deleteMcpServer(id: string): Promise<void>;
}
