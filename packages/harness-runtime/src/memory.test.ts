import { forget, profileMemoryLimit, readProfileMemory, remember } from "./memory.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations. */

let folder: string;
const now = new Date("2026-11-09T12:00:00.000Z");

beforeEach(async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  folder = await mkdtemp(join(tmpdir(), "opencode", "memory-test-"));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

test("profile memory is capped and stays readable for the managed prefix", async () => {
  await remember(folder, { layer: "profile", text: "Owner works in UTC." }, now);
  expect(await readProfileMemory(folder)).toBe("- Owner works in UTC.\n");
  const long = "x".repeat(2000);
  await remember(folder, { layer: "profile", text: `${long}a` }, now);
  await expect(remember(folder, { layer: "profile", text: `${long}b` }, now)).rejects.toMatchObject(
    { code: "INVALID_INPUT" },
  );
  expect((await readProfileMemory(folder)).length).toBeLessThanOrEqual(profileMemoryLimit);
  expect(await forget(folder, { layer: "profile", match: "xxxxa" }, now)).toEqual({
    layer: "profile",
    removed: 1,
  });
  await remember(folder, { layer: "profile", text: `${long}b` }, now);
  expect(await readProfileMemory(folder)).toContain("xxxxb");
});

test("notes expire, and expiry is rejected for other layers", async () => {
  await remember(
    folder,
    { layer: "notes", text: "Follow up Friday", expiresAt: "2026-11-09T13:00:00.000Z" },
    now,
  );
  await remember(folder, { layer: "notes", text: "Keep forever" }, now);
  const later = new Date("2026-11-09T14:00:00.000Z");
  await remember(folder, { layer: "notes", text: "Newer note" }, later);
  const notes = await readFile(join(folder, "memory", "notes.md"), "utf8");
  expect(notes).not.toContain("Follow up Friday");
  expect(notes).toContain("Keep forever");
  await expect(
    remember(folder, { layer: "notes", text: "Past", expiresAt: "2026-11-01T00:00:00.000Z" }, now),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    remember(
      folder,
      { layer: "profile", text: "Fact", expiresAt: "2026-12-01T00:00:00.000Z" },
      now,
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

test("log entries go to the month file and forget searches every month", async () => {
  await remember(folder, { layer: "log", text: "Shipped the launch plan" }, now);
  await remember(
    folder,
    { layer: "log", text: "Shipped the pricing page" },
    new Date("2026-12-01T00:00:00.000Z"),
  );
  expect(await readFile(join(folder, "memory", "log", "2026-11.md"), "utf8")).toBe(
    "- 2026-11-09T12:00:00.000Z Shipped the launch plan\n",
  );
  expect(await forget(folder, { layer: "log", match: "shipped" }, now)).toEqual({
    layer: "log",
    removed: 2,
  });
});
