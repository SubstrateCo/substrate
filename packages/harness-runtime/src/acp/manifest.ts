import type { HarnessKind } from "@substrate/contracts/harness";

import type { AcpPrefixChannel } from "./api.ts";

/**
 * How an agent speaks ACP:
 * - native: the user's CLI has an ACP mode, such as `opencode acp`.
 * - adapter: Substrate ships the ACP adapter as a dependency and points it at the user's CLI
 *   through an environment variable. The user installs only the CLI.
 */
type AcpLocate =
  | { kind: "native"; cli: string; args: string[] }
  | { kind: "adapter"; cli: string; package: string; bin: string; cliEnv: string };

export interface AcpManifestEntry {
  /** ID in the ACP agent registry. */
  registryId: string;
  /** Lowest CLI version this client supports. Older installs are not detected. */
  minVersion?: string;
  prefixChannel: AcpPrefixChannel;
  locate: AcpLocate;
}

/** Pinned allowlist of ACP agents. Substrate detects the user's CLIs and never installs them. */
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
