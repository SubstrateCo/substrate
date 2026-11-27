import { harnessInstructionsFiles, type HarnessKind } from "@substrate/contracts/harness-runtime";

import type { AcpPrefixChannel } from "./acp/api.ts";
import { requireAgent } from "./acp/detect.ts";
import { connectAcpAdapter } from "./acp/index.ts";
import { acpManifest } from "./acp/manifest.ts";
import type { AdapterContext, NativeAdapter } from "./adapters/types.ts";
import { join } from "node:path";

export interface HarnessDefinition {
  instructions: string;
  skills: string;
  /**
   * Where the managed prefix goes: systemPrompt through ACP session setup, or instructions at the
   * start of the instructions file.
   */
  prefixChannel: AcpPrefixChannel;
  /**
   * For a session that works in another folder: launch environment that makes the harness load
   * its own folder's instructions file and skills. Without it, the instructions go in the system
   * prompt and the harness finds the skills under the folder as an extra root.
   */
  managedEnvironment?: (folder: string) => Record<string, string>;
}

export const harnessDefinitions = {
  opencode: {
    instructions: harnessInstructionsFiles.opencode,
    skills: ".opencode/skills",
    prefixChannel: acpManifest.opencode.prefixChannel,
    // opencode 2.4.1 reads neither instructions nor skills from ACP additionalDirectories. It
    // merges OPENCODE_CONFIG_CONTENT over its config files; `instructions` and `skills` take
    // absolute paths (opencode.ai/docs/instructions, opencode.ai/docs/skills).
    managedEnvironment: (folder) => ({
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        instructions: [join(folder, harnessInstructionsFiles.opencode)],
        skills: [join(folder, ".opencode", "skills")],
      }),
    }),
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
  const definition: HarnessDefinition = harnessDefinitions[harness];
  return connectAcpAdapter({
    launch,
    prefixChannel: definition.prefixChannel,
    prefix,
    resumeId,
    context,
    launchEnvironment: context.managedDirectory
      ? definition.managedEnvironment?.(context.managedDirectory)
      : undefined,
  });
}
