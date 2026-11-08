import { harnessInstructionsFiles, type HarnessKind } from "@startup-os/contracts/harness";

/** Native file locations inside an agent folder, relative to that folder. */
export interface HarnessLayout {
  /** Project instructions file the harness loads from its working directory. */
  instructions: string;
  /** Folder that holds `<id>/SKILL.md` skills. */
  skills: string;
  /** MCP configuration candidates in precedence order. The first one is created when none exist. */
  mcpFiles: string[];
  /** Key path to the MCP server map inside the configuration file. */
  mcpKeys: string[];
}

export const harnessLayouts: Record<HarnessKind, HarnessLayout> = {
  opencode: {
    instructions: harnessInstructionsFiles.opencode,
    skills: ".opencode/skills",
    mcpFiles: [
      "opencode.json",
      "opencode.jsonc",
      ".opencode/opencode.json",
      ".opencode/opencode.jsonc",
    ],
    mcpKeys: ["mcp", "servers"],
  },
  claude: {
    instructions: harnessInstructionsFiles.claude,
    skills: ".claude/skills",
    mcpFiles: [".mcp.json"],
    mcpKeys: ["mcpServers"],
  },
  antigravity: {
    instructions: harnessInstructionsFiles.antigravity,
    skills: ".agents/skills",
    mcpFiles: [".agents/mcp_config.json"],
    mcpKeys: ["mcpServers"],
  },
  codex: {
    instructions: harnessInstructionsFiles.codex,
    skills: ".agents/skills",
    mcpFiles: [".codex/config.toml"],
    mcpKeys: ["mcp_servers"],
  },
};
