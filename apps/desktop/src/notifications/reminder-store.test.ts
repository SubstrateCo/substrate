import { defaultMeetingReminderSettings } from "@substrate/contracts/desktop/screen-notifications-ipc";

import { createReminderStore } from "./reminder-store.ts";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directories: string[] = [];
function file() {
  const directory = mkdtempSync(join(tmpdir(), "reminders-"));
  directories.push(directory);
  return join(directory, "screen-notifications.json");
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test("a missing or damaged file falls back to the default settings", () => {
  const path = file();
  expect(createReminderStore(path).settings()).toEqual(defaultMeetingReminderSettings);
  writeFileSync(path, "{not json");
  expect(createReminderStore(path).settings()).toEqual(defaultMeetingReminderSettings);
  writeFileSync(path, JSON.stringify({ meetingReminders: { enabled: false, leadMinutes: 7 } }));
  expect(createReminderStore(path).settings()).toEqual(defaultMeetingReminderSettings);
});

test("settings, dismissals, and snoozes survive a restart and leave no temporary file", () => {
  const path = file();
  const now = 1_000;
  const store = createReminderStore(path, () => now);
  store.setSettings({ enabled: false, leadMinutes: 5 });
  store.dismiss("meeting:a", 5_000);
  store.snooze("meeting:b", 3_000);
  const restarted = createReminderStore(path, () => now);
  expect(restarted.settings()).toEqual({ enabled: false, leadMinutes: 5 });
  expect(restarted.isDismissed("meeting:a")).toBe(true);
  expect(restarted.snoozedUntil("meeting:b")).toBe(3_000);
  expect(readdirSync(join(path, ".."))).toEqual(["screen-notifications.json"]);
  // SAFETY: a lead time outside the contract, to check that the store validates at runtime.
  expect(() => store.setSettings({ enabled: true, leadMinutes: 3 as 2 })).toThrow();
});

test("expired entries stop applying and are pruned on the next write", () => {
  const path = file();
  let now = 1_000;
  const store = createReminderStore(path, () => now);
  store.dismiss("meeting:a", 2_000);
  store.snooze("meeting:b", 2_000);
  now = 2_000;
  expect(store.isDismissed("meeting:a")).toBe(false);
  expect(store.snoozedUntil("meeting:b")).toBeNull();
  store.dismiss("meeting:c", 9_000);
  expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({
    dismissed: { "meeting:c": 9_000 },
    snoozed: {},
  });
});
