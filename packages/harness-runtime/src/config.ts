import {
  harnessKinds,
  startupInstructions,
  startupSkillContent,
  startupSkillDescription,
  startupSkillId,
  type HarnessAgent,
  type HarnessConfiguration,
  type HarnessKind,
  type HarnessSkill,
} from "@startup-os/contracts/harness";

import { HarnessError } from "./errors.ts";
import { harnessLayouts } from "./harness-layout.ts";
import { organizationDirectory, safeId, safePath } from "./paths.ts";
import { writeFile } from "node:fs/promises";

export function startupSkill(harness: HarnessKind): HarnessSkill {
  return {
    id: startupSkillId,
    name: startupSkillId,
    description: startupSkillDescription,
    content: startupSkillContent(harness),
  };
}

/** Files Startup OS provides for an agent, relative to its folder. The user owns them once written. */
export function defaultFiles(organizationId: string, agent: HarnessAgent) {
  const layout = harnessLayouts[agent.harness];
  const skill = startupSkill(agent.harness);
  const files = new Map([
    [
      layout.instructions,
      agent.useStartupDefaults
        ? `${startupInstructions({ ...agent, organizationId })}${agent.instructions}\n`
        : `${agent.instructions}\n`,
    ],
  ]);
  if (agent.useStartupDefaults)
    files.set(
      `${layout.skills}/${skill.id}/SKILL.md`,
      `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${skill.content}`,
    );
  return files;
}

/** Writes missing default files. With `reset`, replaces existing ones too. Never deletes files. */
export async function writeDefaultFiles(
  agentRoot: string,
  organizationId: string,
  agent: HarnessAgent,
  reset = false,
): Promise<void> {
  for (const [path, content] of defaultFiles(organizationId, agent)) {
    const target = await safePath(agentRoot, path, false, true);
    await writeFile(target, content, { mode: 0o600, flag: reset ? "w" : "wx" }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      },
    );
  }
}

export async function materialize(
  accountDirectory: string,
  config: HarnessConfiguration,
): Promise<string> {
  const directory = await organizationDirectory(accountDirectory, config.organizationId);
  const ids = new Set<string>();
  for (const agent of config.agents) {
    safeId(agent.id);
    if (ids.has(agent.id))
      throw new HarnessError("duplicate-id", `Duplicate agent ID: ${agent.id}`);
    ids.add(agent.id);
    if (!harnessKinds.includes(agent.harness))
      throw new HarnessError("invalid-harness", "Unknown harness kind.");
    const agentRoot = await safePath(directory, safeId(agent.id), true);
    if (agent.enabled) await writeDefaultFiles(agentRoot, config.organizationId, agent);
  }
  return directory;
}
