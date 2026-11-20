import type { HarnessKind, HarnessSkill } from "@substrate/contracts/harness";

import { HarnessError } from "./errors.ts";
import { readOptional, safeId, safePath } from "./paths.ts";
import { harnessDefinitions } from "./registry.ts";
import { readdir, unlink, writeFile } from "node:fs/promises";
import { parseDocument } from "yaml";
import { z } from "zod";

export async function scanNativeSkills(
  directory: string,
  harness: HarnessKind,
): Promise<HarnessSkill[]> {
  const root = await safePath(directory, harnessDefinitions[harness].skills);
  const skills: HarnessSkill[] = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return [];
    },
  )) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const path = await safePath(
      directory,
      `${harnessDefinitions[harness].skills}/${safeId(entry.name)}/SKILL.md`,
    );
    const text = await readOptional(path);
    if (!text) continue;
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
    if (!match)
      throw new HarnessError("invalid-skill", `Skill lacks YAML frontmatter: ${entry.name}`);
    const frontmatter = parseDocument(match[1]);
    if (frontmatter.errors.length)
      throw new HarnessError("invalid-skill", `Invalid YAML frontmatter: ${entry.name}`);
    const field = (key: string) => z.string().catch("").parse(frontmatter.get(key));
    skills.push({
      id: entry.name,
      name: field("name") || entry.name,
      description: field("description"),
      content: match[2].replace(/^\r?\n/, ""),
    });
  }
  return skills;
}

export async function saveNativeSkill(
  directory: string,
  harness: HarnessKind,
  skill: HarnessSkill,
): Promise<void> {
  safeId(skill.id);
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.id) ||
    skill.id.length > 64 ||
    skill.name !== skill.id
  )
    throw new HarnessError(
      "invalid-skill-name",
      "Skill name must match its lowercase, hyphen-separated directory ID (at most 64 characters).",
    );
  const path = await safePath(
    directory,
    `${harnessDefinitions[harness].skills}/${safeId(skill.id)}/SKILL.md`,
    false,
    true,
  );
  const existing = await readOptional(path);
  // Preserve all unrelated frontmatter fields when editing a native skill.
  const match = existing && /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(existing);
  const frontmatter = parseDocument(match ? match[1] : "{}");
  if (frontmatter.errors.length)
    throw new HarnessError("invalid-skill", "Cannot edit invalid YAML frontmatter.");
  for (const [key, value] of [
    ["name", skill.name],
    ["description", skill.description],
  ]) {
    frontmatter.set(key, value);
  }
  const content = `---\n${frontmatter.toString()}---\n\n${skill.content}`;
  await writeFile(path, content, { mode: 0o600 });
}

export async function deleteNativeSkill(
  directory: string,
  harness: HarnessKind,
  id: string,
): Promise<void> {
  await unlink(
    await safePath(directory, `${harnessDefinitions[harness].skills}/${safeId(id)}/SKILL.md`),
  );
}
