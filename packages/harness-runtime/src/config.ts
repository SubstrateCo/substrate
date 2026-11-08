import {
  harnessKinds,
  type HarnessAgent,
  type HarnessConfiguration,
  type HarnessKind,
  type HarnessSkill,
} from "@startup-os/contracts/harness";

import { HarnessError } from "./errors.ts";
import { harnessLayouts } from "./harness-layout.ts";
import { organizationDirectory, safeId, safePath } from "./paths.ts";
import { writeFile } from "node:fs/promises";

export const startupSkillId = "startup-os-default";

export function startupSkill(harness: HarnessKind): HarnessSkill {
  return {
    id: startupSkillId,
    name: startupSkillId,
    description: "Work safely inside a Startup OS agent folder.",
    content: `Read ${harnessLayouts[harness].instructions} in the current agent folder for your Startup OS identity and workspace. Use the Startup OS MCP for application records. All writes are attributed to you as an agent, not your owner. Access is checked for each call. Never infer access from matching IDs. Read thread replies separately using list_messages with threadId. Preserve source messages using create_task.source. Use the same requestId only for identical retries. A workspace switch requires a new run; never redirect work to another organization.`,
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
        ? `# Startup OS workspace\n\nAgent: ${JSON.stringify(agent.name)}\nAgent definition ID: ${agent.id}\nOrganization ID: ${organizationId}\n\n${skill.content}\n\nYou have your own actor and explicit record grants. Your owner's access is not your access. Messages and task activity must use your agent identity. The MCP credential supplies identity; do not put acting identity or organization fields in tool inputs. Other agents have separate folders.\n\n## Agent instructions\n\n${agent.instructions}\n`
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
