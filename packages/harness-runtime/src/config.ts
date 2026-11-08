import type { HarnessConfiguration, HarnessSkill } from "@startup-os/contracts/harness";

import { HarnessError } from "./errors.ts";
import { saveNativeSkill } from "./native-config.ts";
import { agentDirectory, organizationDirectory, safeId, safePath } from "./paths.ts";
import { createHash } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";

export const startupSkill: HarnessSkill = {
  id: "startup-os-default",
  name: "startup-os-default",
  description: "Work safely inside a Startup OS agent folder.",
  content:
    "Read AGENTS.md in the current agent folder for your Startup OS identity and workspace. Use the Startup OS MCP for application records. All writes are attributed to you as an agent, not your owner. Access is checked for each call. Never infer access from matching IDs. Read thread replies separately using list_messages with threadId. Preserve source messages using create_task.source. Use the same requestId only for identical retries. A workspace switch requires a new run; never redirect work to another organization.",
};

export function nativeName(id: string): string {
  return `startup-os-${safeId(id).toLowerCase()}-${createHash("sha256").update(id).digest("hex").slice(0, 8)}`;
}

export async function materialize(
  accountDirectory: string,
  config: HarnessConfiguration,
): Promise<string> {
  const directory = await organizationDirectory(accountDirectory, config.organizationId);
  const ids = new Set<string>();
  const files: Record<string, string> = {};
  for (const agent of config.agents) {
    safeId(agent.id);
    if (ids.has(agent.id))
      throw new HarnessError("duplicate-id", `Duplicate agent ID: ${agent.id}`);
    ids.add(agent.id);
    if (!["opencode", "antigravity", "claude", "codex"].includes(agent.harness))
      throw new HarnessError("invalid-harness", "Unknown harness kind.");
    const agentRoot = await agentDirectory(accountDirectory, config.organizationId, agent.id);
    if (!agent.enabled) continue;
    if (agent.useStartupDefaults)
      await saveNativeSkill(agentRoot, agent.harness, startupSkill, true);
    if (agent.useStartupDefaults)
      files[`${agent.id}/AGENTS.md`] =
        `# Startup OS workspace\n\nAgent: ${JSON.stringify(agent.name)}\nAgent definition ID: ${agent.id}\nOrganization ID: ${config.organizationId}\n\n${startupSkill.content}\n\nYou have your own actor and explicit record grants. Your owner's access is not your access. Messages and task activity must use your agent identity. The MCP credential supplies identity; do not put acting identity or organization fields in tool inputs. Other agents have separate folders.\n\n## Agent instructions\n\n${agent.instructions}\n`;
    // This file is app-owned. Native credentials and local skill/MCP files are never copied here.
    files[`${agent.id}/.startup-os/harness/${agent.id}/agent.json`] =
      JSON.stringify(
        {
          id: agent.id,
          name: agent.name,
          harness: agent.harness,
          instructions: agent.instructions,
          model: agent.model,
          enabled: agent.enabled,
          useStartupDefaults: agent.useStartupDefaults,
        },
        null,
        2,
      ) + "\n";
    if (agent.harness === "antigravity")
      files[`${agent.id}/.agents/agents/${nativeName(agent.id)}.md`] =
        `---\nname: ${JSON.stringify(nativeName(agent.id))}\ndescription: ${JSON.stringify(agent.name)}\n---\n\n${agent.instructions}\n`;
  }
  const manifest = await safePath(directory, ".startup-os/harness/owned-files.json", false, true);
  // SAFETY: every manifest key is checked against the owned-file allowlist before it is used as a path; values are only compared with file text.
  const previous = JSON.parse((await readOptional(manifest)) ?? "{}") as Record<string, string>;
  const targets = new Map<string, string>();
  for (const path of Object.keys({ ...previous, ...files })) {
    if (
      !/^[a-zA-Z0-9_-]+\/\.startup-os\/harness\/[a-zA-Z0-9_-]+\/agent\.json$/.test(path) &&
      !/^[a-zA-Z0-9_-]+\/AGENTS\.md$/.test(path) &&
      !/^[a-zA-Z0-9_-]+\/\.agents\/agents\/startup-os-[a-z0-9_-]+-[a-f0-9]{8}\.md$/.test(path)
    )
      throw new HarnessError("invalid-manifest", "Ownership manifest contains an unexpected path.");
    const target = await safePath(directory, path, false, true);
    const existing = await readOptional(target);
    if (existing !== undefined && existing !== previous[path] && existing !== files[path])
      throw new HarnessError(
        "configuration-conflict",
        `An app-owned file has local changes: ${path}`,
      );
    targets.set(path, target);
  }
  for (const [path, target] of targets) {
    if (path in files) await writeFile(target, files[path], { mode: 0o600 });
    else
      await unlink(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
  }
  await writeFile(manifest, JSON.stringify(files), { mode: 0o600 });
  return directory;
}

export async function readOptional(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
}
