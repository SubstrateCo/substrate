import type { HarnessConfiguration, HarnessSkill } from "@startup-os/contracts/harness";

import { HarnessError } from "./errors.ts";
import { saveNativeSkill } from "./native-config.ts";
import { organizationDirectory, safeId, safePath } from "./paths.ts";
import { createHash } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";

export const startupSkill: HarnessSkill = {
  id: "startup-os-default",
  name: "startup-os-default",
  description: "Work safely inside a Startup OS organization folder.",
  content:
    "Work in the current organization folder. Keep organization boundaries explicit. Do not infer access or identity from matching IDs. The Startup OS MCP currently exposes only hello_world; it does not provide workspace records or delegation. Never claim that you read or changed app data through it.",
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
    if (!agent.enabled) continue;
    if (agent.useStartupDefaults)
      await saveNativeSkill(directory, agent.harness, startupSkill, true);
    // This file is app-owned. Native credentials and local skill/MCP files are never copied here.
    files[`.startup-os/harness/${safeId(agent.id)}/agent.json`] =
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
      files[`.agents/agents/${nativeName(agent.id)}.md`] =
        `---\nname: ${JSON.stringify(nativeName(agent.id))}\ndescription: ${JSON.stringify(agent.name)}\n---\n\n${agent.instructions}\n`;
  }
  const manifest = await safePath(directory, ".startup-os/harness/owned-files.json", false, true);
  // SAFETY: every manifest key is checked against the owned-file allowlist before it is used as a path; values are only compared with file text.
  const previous = JSON.parse((await readOptional(manifest)) ?? "{}") as Record<string, string>;
  const targets = new Map<string, string>();
  for (const path of Object.keys({ ...previous, ...files })) {
    if (
      !/^\.startup-os\/harness\/[a-zA-Z0-9_-]+\/agent\.json$/.test(path) &&
      !/^\.agents\/agents\/startup-os-[a-z0-9_-]+-[a-f0-9]{8}\.md$/.test(path)
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
