import type { SaveSkillInput } from "@substrate/contracts/agents";
import type {
  HarnessLocalConfiguration,
  HarnessMcpServer,
} from "@substrate/contracts/harness-runtime";

type LocalAgentConfiguration = Pick<
  HarnessLocalConfiguration,
  "skills" | "mcpServers" | "workspace"
>;

export interface LocalConfigurationController {
  scan(): Promise<LocalAgentConfiguration>;
  saveSkill(input: SaveSkillInput): Promise<void>;
  deleteSkill(id: string): Promise<void>;
  resetDefaults(): Promise<void>;
  saveMcpServer(server: HarnessMcpServer): Promise<void>;
  deleteMcpServer(id: string): Promise<void>;
  chooseWorkspace(): Promise<void>;
  clearWorkspace(): Promise<void>;
}
