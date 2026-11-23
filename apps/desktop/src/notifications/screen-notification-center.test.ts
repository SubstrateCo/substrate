import type {
  MeetingNotification,
  ScreenNotificationEvent,
} from "@substrate/contracts/desktop/screen-notifications-ipc";

import { createScreenNotificationCenter } from "./screen-notification-center.ts";
import { manualClock } from "./test-support.ts";
import { expect, test } from "bun:test";

const start = Date.parse("2026-11-22T09:00:00.000Z");
const at = (minutes: number) => new Date(start + minutes * 60_000).toISOString();

function card(id: string, overrides: Partial<MeetingNotification> = {}): MeetingNotification {
  return {
    id,
    kind: "meeting",
    priority: "normal",
    createdAt: at(0),
    expiresAt: at(30),
    payload: {
      title: id,
      startsAt: at(1),
      endsAt: at(30),
      calendarName: "Work",
      color: null,
      phase: "upcoming",
      joinable: false,
    },
    actions: ["open", "snooze", "dismiss"],
    ...overrides,
  };
}

function setup() {
  const clock = manualClock(start);
  const events: ScreenNotificationEvent[] = [];
  const visibility: string[] = [];
  const center = createScreenNotificationCenter({
    clock,
    sink: {
      emit: (event) => events.push(event),
      show: () => visibility.push("show"),
      hide: () => visibility.push("hide"),
    },
  });
  return { clock, events, visibility, center };
}

test("shows three cards by priority then age, and promotes a queued card when one leaves", () => {
  const { center, events } = setup();
  center.post(card("late", { createdAt: at(3) }));
  center.post(card("early", { createdAt: at(1) }));
  center.post(card("middle", { createdAt: at(2) }));
  center.post(card("urgent", { createdAt: at(4), priority: "high" }));
  expect(center.list().map((item) => item.id)).toEqual(["urgent", "early", "middle"]);
  events.length = 0;
  center.retract("urgent");
  expect(center.list().map((item) => item.id)).toEqual(["early", "middle", "late"]);
  expect(events).toEqual([
    { type: "remove", id: "urgent" },
    { type: "upsert", notification: card("late", { createdAt: at(3) }) },
  ]);
});

test("asks the window to show for the first card and to hide after the last one", () => {
  const { center, visibility } = setup();
  center.post(card("a"));
  center.post(card("b"));
  center.retract("a");
  expect(visibility).toEqual(["show"]);
  center.retract("b");
  expect(visibility).toEqual(["show", "hide"]);
});

test("removes cards at their expiry", () => {
  const { center, clock, events, visibility } = setup();
  center.post(card("short", { expiresAt: at(5) }));
  center.post(card("long", { expiresAt: at(10) }));
  clock.advance(5 * 60_000);
  expect(center.list().map((item) => item.id)).toEqual(["long"]);
  expect(events.at(-1)).toEqual({ type: "remove", id: "short" });
  clock.advance(5 * 60_000);
  expect(center.list()).toEqual([]);
  expect(visibility).toEqual(["show", "hide"]);
});

test("an update replaces the card in place and keeps its queue position", () => {
  const { center, events } = setup();
  center.post(card("a", { createdAt: at(1) }));
  center.post(card("b", { createdAt: at(2) }));
  const started = card("a", { createdAt: at(9) });
  started.payload.phase = "started";
  center.update(started);
  expect(center.list().map((item) => [item.id, item.payload.phase])).toEqual([
    ["a", "started"],
    ["b", "upcoming"],
  ]);
  expect(events.at(-1)).toMatchObject({
    type: "upsert",
    notification: { id: "a", createdAt: at(1) },
  });
});

test("dispatches an offered action to its kind and ignores unknown IDs and actions", async () => {
  const { center } = setup();
  const calls: string[] = [];
  center.register("meeting", {
    join: (notification) => {
      calls.push(`join:${notification.id}`);
    },
    dismiss: (notification) => {
      calls.push(`dismiss:${notification.id}`);
    },
  });
  center.post(card("a"));
  await center.act("a", "dismiss");
  await center.act("a", "join");
  await center.act("missing", "dismiss");
  expect(calls).toEqual(["dismiss:a"]);
});

test("rejects a card that does not match the contract", () => {
  const { center } = setup();
  expect(() => center.post({ ...card("a"), id: "" })).toThrow();
  expect(center.list()).toEqual([]);
});
