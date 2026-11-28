import {
  packageSkillNameSchema,
  skillPackageStateSchema,
  skillRepositorySchema,
  type HarnessKind,
  type SkillPackages,
  type SkillUpdateFrequency,
} from "@substrate/contracts/harness-runtime";

import { HarnessError } from "./errors.ts";
import { safePath } from "./paths.ts";
import { harnessDefinitions } from "./registry.ts";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installSkills, listSkills, removeSkills, resolveSource } from "skills";

const exec = promisify(execFile);
const defaults: SkillPackages["updates"] = {
  frequency: "daily",
  lastAttemptAt: null,
  lastSuccessAt: null,
  error: null,
};
const day = 24 * 60 * 60 * 1000;

export function skillUpdateDue(state: SkillPackages["updates"], now: number) {
  if (state.frequency === "manual") return false;
  // A failed run waits at least an hour; success follows the selected cadence.
  if (state.lastAttemptAt !== null && now - state.lastAttemptAt < 60 * 60 * 1000) return false;
  return (
    state.lastSuccessAt === null ||
    now - state.lastSuccessAt >= day * (state.frequency === "weekly" ? 7 : 1)
  );
}

/** Vercel owns this directory and its lock. Native agent files are copies, never links. */
async function packageRoot(directory: string) {
  return safePath(directory, ".substrate-skills", true);
}

async function readState(root: string) {
  const path = await safePath(root, "updates.json");
  const text = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  return text ? skillPackageStateSchema.parse(JSON.parse(text)) : { ...defaults };
}

async function writeState(root: string, state: SkillPackages["updates"]) {
  const temporary = await safePath(root, "updates.tmp.json");
  const target = await safePath(root, "updates.json");
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
  await rename(temporary, target);
}

async function tracked(root: string) {
  const result = await listSkills({ cwd: root, scope: "project", agents: ["universal"] });
  return result.skills.filter((skill) => skill.source);
}

export async function scanSkillPackages(directory: string): Promise<SkillPackages> {
  const root = await packageRoot(directory);
  return {
    skills: (await tracked(root)).map((skill) => ({
      name: skill.name,
      description: skill.description,
      source: skill.source!,
    })),
    updates: await readState(root),
  };
}

export async function previewSkillSource(directory: string, input: string) {
  const source = skillRepositorySchema.parse(input);
  const resolved = await resolveSource(`https://github.com/${source}`, {
    cwd: await packageRoot(directory),
    signal: AbortSignal.timeout(60_000),
  });
  try {
    return {
      source,
      skills: resolved.skills
        .filter(
          (skill) =>
            packageSkillNameSchema.safeParse(skill.name).success && !skill.duplicates?.length,
        )
        .map(({ name, description }) => ({ name, description })),
    };
  } finally {
    await resolved.dispose();
  }
}

/** Validate after updates too: the CLI's update path has no symlinks:'reject' option. */
async function validateTree(root: string) {
  let count = 0;
  let bytes = 0;
  const digest = createHash("sha256");
  async function walk(path: string): Promise<void> {
    const entries = (await readdir(path, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const reserved =
        /[. ]$/.test(entry.name) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(entry.name);
      // oxlint-disable-next-line no-control-regex -- Reject Windows control characters in upstream paths.
      const invalid = !/^[^<>:"|?*\x00-\x1f]+$/.test(entry.name);
      if (entry.isSymbolicLink() || invalid || reserved)
        throw new HarnessError("invalid-skill", "Skill contains an unsafe file.");
      const file = join(path, entry.name);
      if (++count > 2000) throw new HarnessError("invalid-skill", "Skill has too many files.");
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        bytes += (await lstat(file)).size;
        if (bytes > 20 * 1024 * 1024)
          throw new HarnessError("invalid-skill", "Skill is too large.");
        digest
          .update(relative(root, file).replaceAll("\\", "/"))
          .update("\0")
          .update(await readFile(file))
          .update("\0");
      } else throw new HarnessError("invalid-skill", "Skill contains an unsupported file.");
    }
  }
  await walk(root);
  return digest.digest("hex");
}

async function activate(directory: string, harness: HarnessKind, root: string, name: string) {
  packageSkillNameSchema.parse(name);
  const source = await safePath(root, `.agents/skills/${name}`);
  await validateTree(source);
  const base = await safePath(directory, harnessDefinitions[harness].skills, true);
  const target = await safePath(base, name);
  const pending = await safePath(root, `pending-${name}`);
  const backup = await safePath(root, `previous-${name}`);
  await rm(pending, { recursive: true, force: true });
  await cp(source, pending, { recursive: true, dereference: false });
  await rm(backup, { recursive: true, force: true });
  const exists = await lstat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (exists) await rename(target, backup);
  try {
    await rename(pending, target);
  } catch (error) {
    if (exists) await rename(backup, target);
    throw error;
  }
}

export async function installSkillPackage(
  directory: string,
  harness: HarnessKind,
  source: string,
  name: string,
) {
  skillRepositorySchema.parse(source);
  packageSkillNameSchema.parse(name);
  const target = await safePath(directory, `${harnessDefinitions[harness].skills}/${name}`);
  if (
    await lstat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    })
  )
    throw new HarnessError("invalid-skill", "A skill with this name is already installed.");
  const root = await packageRoot(directory);
  const result = await installSkills(`https://github.com/${source}`, {
    cwd: root,
    skills: [name],
    agents: ["universal"],
    scope: "project",
    mode: "copy",
    telemetry: false,
    duplicates: "error",
    symlinks: "reject",
    signal: AbortSignal.timeout(120_000),
  });
  if (result.failed.length || result.installed.length !== 1)
    throw new HarnessError("invalid-skill", "Could not install this skill.");
  await activate(directory, harness, root, name);
}

export async function removeSkillPackage(directory: string, harness: HarnessKind, name: string) {
  packageSkillNameSchema.parse(name);
  const root = await packageRoot(directory);
  if (!(await tracked(root)).some((skill) => skill.name === name))
    throw new HarnessError("invalid-skill", "This is not a catalog skill.");
  const result = await removeSkills([name], {
    // Remove every target in this isolated package directory. Universal readers share one copy.
    cwd: root,
    scope: "project",
    telemetry: false,
  });
  if (result.failed.length) throw new HarnessError("invalid-skill", "Could not remove this skill.");
  await rm(await safePath(directory, `${harnessDefinitions[harness].skills}/${name}`), {
    recursive: true,
    force: true,
  });
}

export async function setSkillUpdateFrequency(directory: string, frequency: SkillUpdateFrequency) {
  const root = await packageRoot(directory);
  await writeState(root, { ...(await readState(root)), frequency });
}

async function runSkillsUpdate(root: string) {
  try {
    await exec("git", ["--version"], { timeout: 10_000, windowsHide: true });
  } catch {
    throw new HarnessError(
      "binary-not-found",
      "Skill updates need Git on this desktop. Install Git, then try again.",
    );
  }
  // Ship the package and run its public CLI with our Node runtime; no npx or system Node.
  const cli = fileURLToPath(import.meta.resolve("skills/bin/cli.mjs"));
  await exec(process.execPath, [cli, "update", "--project", "--yes"], {
    cwd: root,
    timeout: 180_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      DISABLE_TELEMETRY: "1",
      DO_NOT_TRACK: "1",
      // Codex is a universal target (.agents/skills); override ambient agent detection.
      AI_AGENT: "codex",
      CI: "1",
    },
  });
}

export async function updateSkillPackages(
  directory: string,
  harness: HarnessKind,
  scheduled: boolean,
  now = Date.now(),
  runUpdate = runSkillsUpdate,
) {
  const root = await packageRoot(directory);
  const state = await readState(root);
  if (scheduled && !skillUpdateDue(state, now)) return;
  const skills = await tracked(root);
  if (!skills.length) return;
  await writeState(root, { ...state, lastAttemptAt: now, error: null });
  try {
    for (const skill of skills) {
      const name = packageSkillNameSchema.parse(skill.name);
      const native = await safePath(directory, `${harnessDefinitions[harness].skills}/${name}`);
      const original = await safePath(root, `.agents/skills/${name}`);
      if (
        await lstat(native).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
          return undefined;
        })
      ) {
        if ((await validateTree(native)) !== (await validateTree(original)))
          throw new HarnessError(
            "invalid-skill",
            "A catalog skill has local edits. Restore its files before updating.",
          );
      }
    }
    await runUpdate(root);
    for (const skill of await tracked(root)) await activate(directory, harness, root, skill.name);
    await writeState(root, {
      ...state,
      lastAttemptAt: now,
      lastSuccessAt: now,
      error: null,
    });
  } catch (error) {
    await writeState(root, {
      ...state,
      lastAttemptAt: now,
      error:
        error instanceof HarnessError
          ? error.message
          : "Could not update skills. Check your connection and try again.",
    });
    throw new HarnessError("process-exit", "Could not update catalog skills.");
  }
}
