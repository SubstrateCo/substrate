import { harnessInstructionsFiles, type HarnessKind } from "@substrate/contracts/harness-runtime";

import type { AcpPrefixChannel } from "./acp/api.ts";
import { requireAgent } from "./acp/detect.ts";
import { connectAcpAdapter } from "./acp/index.ts";
import { acpManifest } from "./acp/manifest.ts";
import type { AdapterContext, NativeAdapter } from "./adapters/types.ts";

interface HarnessDefinition {
  instructions: string;
  skills: string;
  /**
   * Where the managed prefix goes: systemPrompt through ACP session setup, or instructions at the
   * start of the instructions file.
   */
  prefixChannel: AcpPrefixChannel;
}

export const harnessDefinitions = {
  opencode: {
    instructions: harnessInstructionsFiles.opencode,
    skills: ".opencode/skills",
    prefixChannel: acpManifest.opencode.prefixChannel,
  },
  claude: {
    instructions: harnessInstructionsFiles.claude,
    skills: ".claude/skills",
    prefixChannel: acpManifest.claude.prefixChannel,
  },
  codex: {
    instructions: harnessInstructionsFiles.codex,
    skills: ".agents/skills",
    prefixChannel: acpManifest.codex.prefixChannel,
  },
} satisfies Record<HarnessKind, HarnessDefinition>;

/** Detects the harness's ACP agent and connects an adapter over it. */
export async function connectHarness(
  harness: HarnessKind,
  context: AdapterContext,
  prefix: string,
  resumeId?: string,
): Promise<NativeAdapter> {
  const launch = await requireAgent(harness);
  return connectAcpAdapter({
    launch,
    prefixChannel: harnessDefinitions[harness].prefixChannel,
    prefix,
    resumeId,
    context,
  });
}
