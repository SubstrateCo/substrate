import type { SaveSkillInput } from "@substrate/contracts/agents";
import type {
  HarnessLocalConfiguration,
  HarnessMcpServer,
} from "@substrate/contracts/harness-runtime";

type LocalAgentConfiguration = Pick<
  HarnessLocalConfiguration,
  "skills" | "mcpServers" | "workspace"
>;

// The desktop adapter owns local skill files, MCP servers and working folders. No cloud requests.
export interface LocalConfigurationController {
  scan(): Promise<LocalAgentConfiguration>;
  saveSkill(input: SaveSkillInput): Promise<void>;
  deleteSkill(id: string): Promise<void>;
  resetDefaults(): Promise<void>;
  /** Adds or replaces a user-added MCP server in Substrate's local storage. */
  saveMcpServer(server: HarnessMcpServer): Promise<void>;
  deleteMcpServer(id: string): Promise<void>;
  /** Asks for a working folder in the desktop's own dialog. A cancel changes nothing. */
  chooseWorkspace(): Promise<void>;
  /** Returns the agent to its own folder. */
  clearWorkspace(): Promise<void>;
}
