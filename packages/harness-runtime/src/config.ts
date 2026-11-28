import type {
  HarnessAgent,
  HarnessConfiguration,
  HarnessSkill,
} from "@substrate/contracts/harness-runtime";

import { HarnessError } from "./errors.ts";
import { organizationDirectory, safeId, safePath } from "./paths.ts";
import { harnessDefinitions } from "./registry.ts";
import { readFile, unlink, writeFile } from "node:fs/promises";

function skillFile(skill: HarnessSkill, managed = true) {
  return `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\n${managed ? "substrateManaged: true\n" : ""}---\n\n${skill.content}`;
}

async function writeManagedSkills(agentRoot: string, agent: HarnessAgent): Promise<void> {
  for (const { installed, ...skill } of agent.managedSkills) {
    const path = `${harnessDefinitions[agent.harness].skills}/${skill.id}/SKILL.md`;
    const target = await safePath(agentRoot, path, false, true);
    const previous = await readFile(target, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
    const owned =
      previous?.startsWith("---\n") &&
      (previous.split("\n---\n", 1)[0]?.includes("\nsubstrateManaged: true") ||
        previous === skillFile(skill, false));
    if (installed) {
      if (previous === undefined || owned)
        await writeFile(target, skillFile(skill), { mode: 0o600 });
    } else if (owned) await unlink(target);
  }
}

export async function writeAgentFiles(
  folder: string,
  agent: HarnessAgent,
  options: { replaceInstructions?: boolean; managedPrefix?: string } = {},
): Promise<void> {
  const { replaceInstructions = false, managedPrefix } = options;
  const content = `${agent.instructions}\n`;
  const target = await safePath(
    folder,
    harnessDefinitions[agent.harness].instructions,
    false,
    true,
  );
  await writeFile(target, managedPrefix ? `${managedPrefix}\n${content}` : content, {
    mode: 0o600,
    flag: replaceInstructions ? "w" : "wx",
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  await writeManagedSkills(folder, agent);
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
    if (agent.enabled) await writeAgentFiles(agentRoot, agent);
  }
  return directory;
}
