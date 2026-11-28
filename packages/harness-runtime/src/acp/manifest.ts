import type { HarnessKind } from "@substrate/contracts/harness-runtime";

import type { AcpPrefixChannel } from "./api.ts";

type AcpLocate =
  | { kind: "native"; cli: string; args: string[] }
  | { kind: "adapter"; cli: string; package: string; bin: string; cliEnv: string };

export interface AcpManifestEntry {
  registryId: string;
  minVersion?: string;
  prefixChannel: AcpPrefixChannel;
  locate: AcpLocate;
}

export const acpManifest = {
  claude: {
    registryId: "claude-acp",
    prefixChannel: "systemPrompt",
    locate: {
      kind: "adapter",
      cli: "claude",
      package: "@agentclientprotocol/claude-agent-acp",
      bin: "claude-agent-acp",
      // claude-agent-acp dist/claude-cli.js:20 spawns this CLI instead of its bundled one.
      cliEnv: "CLAUDE_CODE_EXECUTABLE",
    },
  },
  codex: {
    registryId: "codex-acp",
    prefixChannel: "systemPrompt",
    locate: {
      kind: "adapter",
      cli: "codex",
      package: "@agentclientprotocol/codex-acp",
      bin: "codex-acp",
      // codex-acp startCodexConnection runs `<CODEX_PATH> app-server` (cross-spawn on Windows).
      cliEnv: "CODEX_PATH",
    },
  },
  opencode: {
    registryId: "opencode",
    minVersion: "2.3.2",
    prefixChannel: "instructions",
    locate: { kind: "native", cli: "opencode", args: ["acp"] },
  },
} as const satisfies Record<HarnessKind, AcpManifestEntry>;
