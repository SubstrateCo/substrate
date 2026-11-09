import {
  harnessInstructionsFiles,
  type HarnessKind,
  type HarnessMcpServer,
  type HarnessModel,
} from "@startup-os/contracts/harness";

import type { AdapterContext, NativeAdapter } from "./adapters/types.ts";

interface HarnessDefinition {
  executable: string;
  instructions: string;
  skills: string;
  /** Candidates in precedence order. The first is created when none exist. */
  mcpFiles: [string, ...string[]];
  mcpKeys: [string, ...string[]];
  mcpFormat: "jsonc" | "toml";
  encodeMcpServer(server: HarnessMcpServer): object;
  connect(context: AdapterContext, resumeId?: string): Promise<NativeAdapter>;
  discoverModels(
    executable: string,
    directory: string,
    signal: AbortSignal,
  ): Promise<HarnessModel[]>;
  available?(executable: string): Promise<boolean>;
}

export const harnessDefinitions = {
  opencode: {
    executable: "opencode",
    instructions: harnessInstructionsFiles.opencode,
    skills: ".opencode/skills",
    mcpFiles: [
      "opencode.json",
      "opencode.jsonc",
      ".opencode/opencode.json",
      ".opencode/opencode.jsonc",
    ],
    mcpKeys: ["mcp", "servers"],
    mcpFormat: "jsonc",
    encodeMcpServer: (server) =>
      server.transport === "http"
        ? { type: "remote", url: server.url }
        : {
            type: "local",
            command: [server.command, ...(server.args ?? [])],
            environment: server.environment,
          },
    connect: async (context, resumeId) =>
      (await import("./adapters/opencode.ts")).connectOpenCode(context, resumeId),
    discoverModels: async (executable, directory, signal) =>
      (await import("./models/opencode.ts")).discoverOpenCodeModels(executable, directory, signal),
  },
  claude: {
    executable: "claude",
    instructions: harnessInstructionsFiles.claude,
    skills: ".claude/skills",
    mcpFiles: [".mcp.json"],
    mcpKeys: ["mcpServers"],
    mcpFormat: "jsonc",
    encodeMcpServer: (server) =>
      server.transport === "http"
        ? { type: "http", url: server.url }
        : { command: server.command, args: server.args ?? [], env: server.environment ?? {} },
    connect: async (context, resumeId) =>
      (await import("./adapters/claude.ts")).connectClaude(context, resumeId),
    discoverModels: async (executable, directory, signal) =>
      (await import("./models/claude.ts")).discoverClaudeModels(executable, directory, signal),
  },
  antigravity: {
    executable: "agy",
    instructions: harnessInstructionsFiles.antigravity,
    skills: ".agents/skills",
    mcpFiles: [".agents/mcp_config.json"],
    mcpKeys: ["mcpServers"],
    mcpFormat: "jsonc",
    encodeMcpServer: (server) =>
      server.transport === "http"
        ? { httpUrl: server.url }
        : { command: server.command, args: server.args ?? [], env: server.environment ?? {} },
    connect: async (context, resumeId) =>
      (await import("./adapters/antigravity.ts")).connectAntigravity(context, resumeId),
    discoverModels: async (executable, directory, signal) =>
      (await import("./models/antigravity.ts")).discoverAntigravityModels(
        executable,
        directory,
        signal,
      ),
    available: async (executable) =>
      (await import("./process.ts")).antigravityAcpAvailable(executable),
  },
  codex: {
    executable: "codex",
    instructions: harnessInstructionsFiles.codex,
    skills: ".agents/skills",
    mcpFiles: [".codex/config.toml"],
    mcpKeys: ["mcp_servers"],
    mcpFormat: "toml",
    encodeMcpServer: (server) =>
      server.transport === "http"
        ? { url: server.url }
        : { command: server.command, args: server.args ?? [], env: server.environment ?? {} },
    connect: async (context, resumeId) =>
      (await import("./adapters/codex.ts")).connectCodex(context, resumeId),
    discoverModels: async (executable, directory, signal) =>
      (await import("./models/codex.ts")).discoverCodexModels(executable, directory, signal),
  },
} satisfies Record<HarnessKind, HarnessDefinition>;
