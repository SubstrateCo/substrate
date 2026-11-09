import {
  harnessKinds,
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
export function defaultFiles(organizationId: string, agent: HarnessAgent) {
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
export async function writeStartupSkills(agentRoot: string, agent: HarnessAgent): Promise<void> {
  if (!agent.useStartupDefaults) return;
  for (const skill of startupSkills) {
    const path = `${harnessDefinitions[agent.harness].skills}/${skill.id}/SKILL.md`;
    const target = await safePath(agentRoot, path, false, true);
    await writeFile(target, skillFile(skill), { mode: 0o600 });
  }
}

/**
 * Writes missing default files. With `reset`, replaces existing ones too. Startup OS skills are
 * always replaced. Never deletes files.
 */
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
  await writeStartupSkills(agentRoot, agent);
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
