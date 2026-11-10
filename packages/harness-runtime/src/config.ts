import {
  startupInstructions,
  startupSkills,
  type HarnessAgent,
  type HarnessConfiguration,
  type HarnessSkill,
} from "@startup-os/contracts/harness";

import { HarnessError } from "./errors.ts";
import { organizationDirectory, safeId, safePath } from "./paths.ts";
import { harnessDefinitions } from "./registry.ts";
import { writeFile } from "node:fs/promises";

function skillFile(skill: HarnessSkill) {
  return `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${skill.content}`;
}

/** Files Startup OS provides for an agent, relative to its folder. The user owns them once written. */
function defaultFiles(organizationId: string, agent: HarnessAgent) {
  return new Map([
    [
      harnessDefinitions[agent.harness].instructions,
      agent.useStartupDefaults
        ? `${startupInstructions({ ...agent, organizationId })}${agent.instructions}\n`
        : `${agent.instructions}\n`,
    ],
  ]);
}

/** Startup OS owns these skills: each write replaces them so they match the current MCP tools. */
async function writeStartupSkills(agentRoot: string, agent: HarnessAgent): Promise<void> {
  if (!agent.useStartupDefaults) return;
  for (const skill of startupSkills) {
    const path = `${harnessDefinitions[agent.harness].skills}/${skill.id}/SKILL.md`;
    const target = await safePath(agentRoot, path, false, true);
    await writeFile(target, skillFile(skill), { mode: 0o600 });
  }
}

/**
 * Writes missing default files. With `replace`, replaces existing ones too: on a reset, and when
 * a session opens, so its folder matches the current agent. Startup OS skills are always
 * replaced. Never deletes files. With managedPrefix, the instructions file starts with it: the
 * managed policy channel for harnesses that load no other instruction source.
 */
export async function writeDefaultFiles(
  folder: string,
  organizationId: string,
  agent: HarnessAgent,
  options: { replace?: boolean; managedPrefix?: string } = {},
): Promise<void> {
  const { replace = false, managedPrefix } = options;
  for (const [path, content] of defaultFiles(organizationId, agent)) {
    const target = await safePath(folder, path, false, true);
    await writeFile(target, managedPrefix ? `${managedPrefix}\n${content}` : content, {
      mode: 0o600,
      flag: replace ? "w" : "wx",
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
  }
  await writeStartupSkills(folder, agent);
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
    const agentRoot = await safePath(directory, safeId(agent.id), true);
    if (agent.enabled) await writeDefaultFiles(agentRoot, config.organizationId, agent);
  }
  return directory;
}
