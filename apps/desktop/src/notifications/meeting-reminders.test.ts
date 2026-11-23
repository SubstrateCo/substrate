import type { ScreenNotificationEvent } from "@substrate/contracts/desktop/screen-notifications-ipc";

import type { CalendarFeedEvent } from "../transport/calendar-feed.ts";
import {
  createMeetingReminders,
  localDate,
  type CalendarEventTarget,
} from "./meeting-reminders.ts";
import { createReminderStore } from "./reminder-store.ts";
import { createScreenNotificationCenter } from "./screen-notification-center.ts";
import { manualClock } from "./test-support.ts";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const minute = 60_000;
const start = Date.parse("2026-11-22T09:00:00.000Z");
const at = (minutes: number) => new Date(start + minutes * minute).toISOString();
const entity = "00000000-0000-4000-8000-000000000001";

function event(overrides: Partial<CalendarFeedEvent> = {}): CalendarFeedEvent {
  return {
    entityId: entity,
    calendarName: "Work",
    color: "#336699",
    title: "Planning",
    startsAt: at(10),
    endsAt: at(40),
    allDay: false,
    status: "confirmed",
    kind: "default",
    conferenceUrl: "https://meet.google.com/abc-defg-hij",
    selfResponseStatus: "accepted",
    ...overrides,
  };
}

/** The signed-in account's calendar feed: null when the calendar is unavailable. */
interface FakeAccount {
  rows: CalendarFeedEvent[] | null;
  cookie: string;
  reads: number;
}

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function setup(initial: CalendarFeedEvent[] = [event()]) {
  const clock = manualClock(start);
  const directory = mkdtempSync(join(tmpdir(), "meetings-"));
  directories.push(directory);
  const store = createReminderStore(join(directory, "reminders.json"), () => clock.now());
  const events: ScreenNotificationEvent[] = [];
  const center = createScreenNotificationCenter({
    clock,
    sink: { emit: (value) => events.push(value), show: () => {}, hide: () => {} },
  });
  const state: FakeAccount = { rows: initial, cookie: "session=one", reads: 0 };
  const opened: string[] = [];
  const targets: CalendarEventTarget[] = [];
  const reminders = createMeetingReminders({
    read: async (_organizationId, range) => {
      state.reads++;
      expect(range.from.getTime()).toBe(clock.now() - 15 * minute);
      expect(range.until.getTime()).toBe(clock.now() + 12 * 60 * minute);
      return state.rows;
    },
    sessionKey: () => state.cookie,
    center,
    store,
    openExternal: (url) => opened.push(url),
    openEvent: (target) => targets.push(target),
    clock,
  });
  const cards = () => center.list().map((card) => [card.id, card.payload.phase]);
  return { clock, store, center, events, state, opened, targets, reminders, cards };
}
const id = (startsAt = at(10)) => `meeting:${entity}:${startsAt}`;

test("posts the card at the lead time, marks it started, and removes it at expiry", async () => {
  const { clock, reminders, cards, center } = setup([event({ endsAt: at(60) })]);
  await reminders.connect("org");
  expect(cards()).toEqual([]);
  clock.set(start + 9 * minute);
  expect(cards()).toEqual([[id(), "upcoming"]]);
  expect(center.list()[0]).toMatchObject({
    priority: "normal",
    expiresAt: at(20),
    payload: { title: "Planning", calendarName: "Work", joinable: true },
    actions: ["join", "open", "snooze", "dismiss"],
  });
  clock.set(start + 10 * minute);
  expect(cards()).toEqual([[id(), "started"]]);
  clock.set(start + 20 * minute);
  expect(cards()).toEqual([]);
});

test("a zero lead posts the started card directly", async () => {
  const { clock, reminders, cards, store, events } = setup();
  store.setSettings({ enabled: true, leadMinutes: 0 });
  await reminders.connect("org");
  clock.set(start + 9 * minute);
  expect(cards()).toEqual([]);
  clock.set(start + 10 * minute);
  expect(cards()).toEqual([[id(), "started"]]);
  expect(events.filter((value) => value.type === "upsert")).toHaveLength(1);
});

test("skips declined, cancelled, all-day, non-meeting, and ended events", async () => {
  const { clock, reminders, cards } = setup([
    event({ entityId: "00000000-0000-4000-8000-000000000002", selfResponseStatus: "declined" }),
    event({ entityId: "00000000-0000-4000-8000-000000000003", status: "cancelled" }),
    event({ entityId: "00000000-0000-4000-8000-000000000004", allDay: true }),
    event({ entityId: "00000000-0000-4000-8000-000000000005", kind: "focus_time" }),
    event({ entityId: "00000000-0000-4000-8000-000000000006", startsAt: at(-30), endsAt: at(0) }),
  ]);
  await reminders.connect("org");
  clock.set(start + 10 * minute);
  expect(cards()).toEqual([]);
});

test("after a wake, shows only meetings that started under five minutes ago", async () => {
  const { reminders, cards } = setup([
    event({ startsAt: at(-6), endsAt: at(30) }),
    event({ entityId: "00000000-0000-4000-8000-000000000002", startsAt: at(-4), endsAt: at(30) }),
  ]);
  await reminders.connect("org");
  expect(cards()).toEqual([[`meeting:00000000-0000-4000-8000-000000000002:${at(-4)}`, "started"]]);
});

test("a refetch retracts declined or moved meetings and updates changed details", async () => {
  const { clock, reminders, cards, state, center } = setup();
  await reminders.connect("org");
  clock.set(start + 9 * minute);
  state.rows = [event({ title: "  ", conferenceUrl: "https://evil.example/zoom" })];
  await reminders.refresh();
  expect(center.list()[0]).toMatchObject({
    payload: { title: "Untitled meeting", joinable: false },
    actions: ["open", "snooze", "dismiss"],
  });
  state.rows = [event({ startsAt: at(30), endsAt: at(60) })];
  await reminders.refresh();
  expect(cards()).toEqual([]);
  clock.set(start + 29 * minute);
  expect(cards()).toEqual([[id(at(30)), "upcoming"]]);
  state.rows = [event({ startsAt: at(30), endsAt: at(60), selfResponseStatus: "declined" })];
  await reminders.refresh();
  expect(cards()).toEqual([]);
});

test("join opens the fetched URL and dismisses; dismiss persists until expiry", async () => {
  const { clock, reminders, cards, center, opened, store } = setup();
  await reminders.connect("org");
  clock.set(start + 9 * minute);
  await center.act(id(), "join");
  expect(opened).toEqual(["https://meet.google.com/abc-defg-hij"]);
  expect(cards()).toEqual([]);
  expect(store.isDismissed(id())).toBe(true);
  clock.set(start + 10 * minute);
  await reminders.refresh();
  expect(cards()).toEqual([]);
});

test("snooze before the start returns at the start; after the start, a minute later", async () => {
  const { clock, reminders, cards, center } = setup();
  await reminders.connect("org");
  clock.set(start + 9 * minute);
  await center.act(id(), "snooze");
  expect(cards()).toEqual([]);
  clock.set(start + 10 * minute);
  expect(cards()).toEqual([[id(), "started"]]);
  clock.set(start + 16 * minute);
  await center.act(id(), "snooze");
  clock.set(start + 16 * minute + 59_000);
  expect(cards()).toEqual([]);
  clock.set(start + 17 * minute);
  expect(cards()).toEqual([[id(), "started"]]);
});

test("open asks for the calendar event in the active organization and closes the card", async () => {
  const { clock, reminders, center, targets, events } = setup();
  await reminders.connect("org");
  clock.set(start + 9 * minute);
  await center.act(id(), "open");
  expect(targets).toEqual([
    { organizationId: "org", eventId: entity, date: localDate(start + 10 * minute) },
  ]);
  expect(events.at(-1)).toEqual({ type: "remove", id: id() });
});

test("disabling reminders retracts cards and stops posting", async () => {
  const { clock, reminders, cards, store } = setup();
  await reminders.connect("org");
  clock.set(start + 9 * minute);
  store.setSettings({ enabled: false, leadMinutes: 1 });
  await reminders.refresh();
  expect(cards()).toEqual([]);
  clock.set(start + 10 * minute);
  expect(cards()).toEqual([]);
});

test("a context hint refetches after a debounce; other organizations are ignored", async () => {
  const { clock, reminders, state } = setup();
  await reminders.connect("org");
  const reads = state.reads;
  const hint = { version: 1, type: "change", id: entity, domain: "context" } as const;
  await reminders.receive({ ...hint, organizationId: "other" });
  await reminders.receive({ ...hint, organizationId: "org" });
  await reminders.receive({ ...hint, organizationId: "org" });
  clock.advance(1_999);
  expect(state.reads).toBe(reads);
  clock.advance(1);
  await Bun.sleep(0);
  expect(state.reads).toBe(reads + 1);
});

test("a transient disconnect keeps cards; a new session or organization clears them", async () => {
  const { clock, reminders, cards, state } = setup();
  await reminders.connect("org");
  clock.set(start + 9 * minute);
  await reminders.receive({ type: "status", status: "disconnected" });
  expect(cards()).toEqual([[id(), "upcoming"]]);
  state.rows = [];
  await reminders.connect("other");
  expect(cards()).toEqual([]);
  state.rows = [event()];
  await reminders.connect("org");
  expect(cards()).toEqual([[id(), "upcoming"]]);
  state.cookie = "session=two";
  clock.advance(30_000);
  expect(cards()).toEqual([]);
});

test("an unavailable calendar retracts cards quietly", async () => {
  const { clock, reminders, cards, state } = setup();
  await reminders.connect("org");
  clock.set(start + 9 * minute);
  state.rows = null;
  await reminders.refresh();
  expect(cards()).toEqual([]);
});
