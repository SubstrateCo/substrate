import {
  skillUpdateDue,
  setSkillUpdateFrequency,
  scanSkillPackages,
  updateSkillPackages,
} from "./skill-packages.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const day = 86_400_000;
const state = {
  frequency: "daily" as const,
  lastAttemptAt: null,
  lastSuccessAt: null,
  error: null,
};

async function packageFixture() {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const directory = await mkdtemp(join(tmpdir(), "opencode", "skill-update-"));
  const root = join(directory, ".substrate-skills");
  const source = join(root, ".agents", "skills", "review");
  const native = join(directory, ".opencode", "skills", "review");
  await mkdir(join(source, "references"), { recursive: true });
  await writeFile(
    join(source, "SKILL.md"),
    "---\nname: review\ndescription: Review work\n---\n\nOriginal",
  );
  await writeFile(join(source, "references", "guide.md"), "Original reference");
  await writeFile(
    join(root, "skills-lock.json"),
    JSON.stringify({
      version: 2,
      skills: {
        review: {
          source: "owner/repo",
          sourceType: "github",
          sourceUrl: "https://github.com/owner/repo",
          skillPath: "review/SKILL.md",
          computedHash: "test",
        },
      },
    }),
  );
  await cp(source, native, { recursive: true });
  return { directory, root, source, native };
}

test("manual updates never run on schedule", () => {
  expect(skillUpdateDue({ ...state, frequency: "manual" }, 10 * day)).toBe(false);
});

test("daily and weekly schedules respect the last successful update", () => {
  expect(skillUpdateDue({ ...state, lastSuccessAt: day }, 2 * day - 1)).toBe(false);
  expect(skillUpdateDue({ ...state, lastSuccessAt: day }, 2 * day)).toBe(true);
  expect(skillUpdateDue({ ...state, frequency: "weekly", lastSuccessAt: day }, 7 * day)).toBe(
    false,
  );
  expect(skillUpdateDue({ ...state, frequency: "weekly", lastSuccessAt: day }, 8 * day)).toBe(true);
});

test("failed runs have a one-hour retry floor instead of retrying each tick", () => {
  expect(skillUpdateDue({ ...state, lastAttemptAt: day }, day + 1000)).toBe(false);
  expect(skillUpdateDue({ ...state, lastAttemptAt: day }, day + 3_600_000)).toBe(true);
});

test("frequency persists per agent and empty agents never invoke the updater", async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "skill-packages-"));
  try {
    await setSkillUpdateFrequency(root, "weekly");
    expect((await scanSkillPackages(root)).updates.frequency).toBe("weekly");
    let called = false;
    await updateSkillPackages(root, "codex", false, day, async () => {
      called = true;
    });
    expect(called).toBe(false);
    expect((await scanSkillPackages(root)).updates.lastAttemptAt).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("successful updates activate the entire package, including changed references", async () => {
  const f = await packageFixture();
  try {
    await updateSkillPackages(f.directory, "opencode", false, day, async () => {
      await writeFile(join(f.source, "references", "guide.md"), "Updated reference");
      await writeFile(join(f.source, "references", "new.md"), "New reference");
    });
    expect(await readFile(join(f.native, "references", "guide.md"), "utf8")).toBe(
      "Updated reference",
    );
    expect(await readFile(join(f.native, "references", "new.md"), "utf8")).toBe("New reference");
    expect((await scanSkillPackages(f.directory)).updates.lastSuccessAt).toBe(day);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("failed updates retain native files and record a safe error with retry state", async () => {
  const f = await packageFixture();
  try {
    await rejects(
      updateSkillPackages(f.directory, "opencode", false, day, async () => {
        throw new Error("private diagnostic");
      }),
      { code: "process-exit" },
    );
    expect(await readFile(join(f.native, "references", "guide.md"), "utf8")).toBe(
      "Original reference",
    );
    const { updates } = await scanSkillPackages(f.directory);
    expect(updates.lastSuccessAt).toBeNull();
    expect(updates.lastAttemptAt).toBe(day);
    expect(updates.error).not.toContain("private diagnostic");
    expect(skillUpdateDue(updates, day + 60_000)).toBe(false);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("locally edited catalog packages are not overwritten or fetched", async () => {
  const f = await packageFixture();
  try {
    await writeFile(join(f.native, "references", "guide.md"), "My edits");
    let fetched = false;
    await rejects(
      updateSkillPackages(f.directory, "opencode", false, day, async () => {
        fetched = true;
      }),
      { code: "process-exit" },
    );
    expect(fetched).toBe(false);
    expect(await readFile(join(f.native, "references", "guide.md"), "utf8")).toBe("My edits");
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
