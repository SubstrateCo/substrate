import { defaultShortcuts } from "@substrate/contracts/desktop/shortcuts";

import { createUserSettingsStore } from "./user-settings-store.ts";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directories: string[] = [];
function file() {
  const directory = mkdtempSync(join(tmpdir(), "user-settings-"));
  directories.push(directory);
  return join(directory, "user-settings.json");
}
const saved = (path: string) => JSON.parse(readFileSync(path, "utf8"));
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test("a missing file is created with the default shortcuts", () => {
  const path = file();
  const store = createUserSettingsStore(path);
  expect(store.shortcuts()).toEqual(defaultShortcuts);
  expect(saved(path)).toEqual({ shortcuts: defaultShortcuts });
});

test("a file without shortcuts gets the defaults and keeps its other keys", () => {
  const path = file();
  writeFileSync(path, JSON.stringify({ other: { kept: true } }));
  createUserSettingsStore(path);
  expect(saved(path)).toEqual({ other: { kept: true }, shortcuts: defaultShortcuts });
});

test("missing or invalid shortcuts get their defaults and valid ones stay", () => {
  const path = file();
  writeFileSync(
    path,
    JSON.stringify({
      shortcuts: { "app.messages": ["G", "D"], "search.open": 42, "app.tasks": [] },
    }),
  );
  const store = createUserSettingsStore(path);
  expect(store.shortcuts()).toEqual({ ...defaultShortcuts, "app.messages": ["G", "D"] });
  expect(saved(path).shortcuts).toEqual(store.shortcuts());
});

test("a complete file is not rewritten", () => {
  const path = file();
  const text = JSON.stringify({ shortcuts: { ...defaultShortcuts, "search.open": "Mod+P" } });
  writeFileSync(path, text);
  expect(createUserSettingsStore(path).shortcuts()["search.open"]).toBe("Mod+P");
  expect(readFileSync(path, "utf8")).toBe(text);
});

test("a file that is not JSON is used as defaults and left alone until a save", () => {
  const path = file();
  writeFileSync(path, "{broken");
  const store = createUserSettingsStore(path);
  expect(store.shortcuts()).toEqual(defaultShortcuts);
  expect(readFileSync(path, "utf8")).toBe("{broken");
  store.setShortcuts({ ...defaultShortcuts, "app.messages": "Mod+1" });
  expect(saved(path).shortcuts["app.messages"]).toBe("Mod+1");
});

test("a saved change survives a restart, leaves no temporary file, and rejects bad input", () => {
  const path = file();
  const store = createUserSettingsStore(path);
  store.setShortcuts({ ...defaultShortcuts, "app.tasks": ["G", "K"] });
  expect(createUserSettingsStore(path).shortcuts()["app.tasks"]).toEqual(["G", "K"]);
  expect(readdirSync(join(path, ".."))).toEqual(["user-settings.json"]);
  // SAFETY: an input outside the contract, to check that the store validates at runtime.
  expect(() => store.setShortcuts({ "app.tasks": "T" } as never)).toThrow();
});
