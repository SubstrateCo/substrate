import {
  defaultMeetingReminderSettings,
  meetingReminderSettings,
  type MeetingReminderSettings,
} from "@substrate/contracts/desktop/screen-notifications-ipc";

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

const key = z.string().min(1).max(200);
const expiry = z.number().int().nonnegative();
const stored = z.object({
  meetingReminders: meetingReminderSettings.catch(defaultMeetingReminderSettings),
  dismissed: z.record(key, expiry).catch({}),
  snoozed: z.record(key, expiry).catch({}),
});
type Stored = z.infer<typeof stored>;

export function createReminderStore(path: string, now: () => number = Date.now) {
  let state: Stored = read();

  function read(): Stored {
    try {
      return stored.parse(JSON.parse(readFileSync(path, "utf8")));
    } catch {
      return { meetingReminders: defaultMeetingReminderSettings, dismissed: {}, snoozed: {} };
    }
  }

  function prune() {
    const at = now();
    const live = (entries: Record<string, number>) =>
      Object.fromEntries(Object.entries(entries).filter(([, until]) => until > at));
    state = { ...state, dismissed: live(state.dismissed), snoozed: live(state.snoozed) };
  }

  function write() {
    prune();
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    renameSync(temporary, path);
  }

  prune();
  return {
    settings: (): MeetingReminderSettings => state.meetingReminders,
    setSettings(value: MeetingReminderSettings) {
      state = { ...state, meetingReminders: meetingReminderSettings.parse(value) };
      write();
      return state.meetingReminders;
    },
    isDismissed: (id: string) => Object.hasOwn(state.dismissed, id) && state.dismissed[id]! > now(),
    snoozedUntil(id: string) {
      const until = Object.hasOwn(state.snoozed, id) ? state.snoozed[id]! : 0;
      return until > now() ? until : null;
    },
    dismiss(id: string, until: number) {
      state.dismissed[key.parse(id)] = until;
      delete state.snoozed[id];
      write();
    },
    snooze(id: string, until: number) {
      state.snoozed[key.parse(id)] = until;
      write();
    },
  };
}
export type ReminderStore = ReturnType<typeof createReminderStore>;
