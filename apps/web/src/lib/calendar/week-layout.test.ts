import { calendarEvent } from "./test-support";
import {
  defaultScrollMinutes,
  initialScrollMinutes,
  layoutDay,
  minimumBlockMinutes,
} from "./week-layout";
import { expect, test } from "bun:test";

const day = new Date(2026, 10, 23);
const at = (hour: number, minute = 0, date = 23) =>
  new Date(2026, 10, date, hour, minute).toISOString();
const placement = (title: string, placed: ReturnType<typeof layoutDay>) => {
  const item = placed.find((entry) => entry.event.title === title)!;
  return { top: item.top, height: item.height, column: item.column, columns: item.columns };
};

test("an event alone takes the full width at its clock time", () => {
  const placed = layoutDay(
    [calendarEvent({ title: "Standup", startsAt: at(9, 30), endsAt: at(10) })],
    day,
  );
  expect(placement("Standup", placed)).toEqual({ top: 570, height: 30, column: 0, columns: 1 });
});

test("overlapping events share the width and a later free column is reused", () => {
  const placed = layoutDay(
    [
      calendarEvent({ title: "A", startsAt: at(9), endsAt: at(11) }),
      calendarEvent({ title: "B", startsAt: at(9, 30), endsAt: at(10) }),
      calendarEvent({ title: "C", startsAt: at(10, 15), endsAt: at(10, 45) }),
    ],
    day,
  );
  expect(placement("A", placed)).toMatchObject({ column: 0, columns: 2 });
  expect(placement("B", placed)).toMatchObject({ column: 1, columns: 2 });
  expect(placement("C", placed)).toMatchObject({ column: 1, columns: 2 });
});

test("events that only touch do not overlap", () => {
  const placed = layoutDay(
    [
      calendarEvent({ title: "First", startsAt: at(9), endsAt: at(10) }),
      calendarEvent({ title: "Second", startsAt: at(10), endsAt: at(11) }),
    ],
    day,
  );
  expect(placement("First", placed).columns).toBe(1);
  expect(placement("Second", placed)).toMatchObject({ column: 0, columns: 1 });
});

test("separate groups of overlaps size their columns separately", () => {
  const placed = layoutDay(
    [
      calendarEvent({ title: "A", startsAt: at(9), endsAt: at(10) }),
      calendarEvent({ title: "B", startsAt: at(9), endsAt: at(10) }),
      calendarEvent({ title: "C", startsAt: at(9), endsAt: at(10) }),
      calendarEvent({ title: "Lunch", startsAt: at(12), endsAt: at(13) }),
    ],
    day,
  );
  const nine = ["A", "B", "C"].map((title) => placement(title, placed));
  expect(nine.map((item) => item.columns)).toEqual([3, 3, 3]);
  expect(new Set(nine.map((item) => item.column))).toEqual(new Set([0, 1, 2]));
  expect(placement("Lunch", placed)).toMatchObject({ column: 0, columns: 1 });
});

test("an event that crosses midnight is clipped to each day", () => {
  const overnight = calendarEvent({ title: "Deploy", startsAt: at(23), endsAt: at(1, 0, 24) });
  expect(placement("Deploy", layoutDay([overnight], day))).toMatchObject({ top: 1380, height: 60 });
  expect(placement("Deploy", layoutDay([overnight], new Date(2026, 10, 24)))).toMatchObject({
    top: 0,
    height: 60,
  });
});

test("a very short event still gets a readable block, and all-day events stay off the grid", () => {
  const placed = layoutDay(
    [
      calendarEvent({ title: "Ping", startsAt: at(14), endsAt: at(14, 5) }),
      calendarEvent({
        title: "Holiday",
        allDay: true,
        startsAt: "2026-11-23T00:00:00.000Z",
        endsAt: "2026-11-24T00:00:00.000Z",
      }),
    ],
    day,
  );
  expect(placed.map((item) => item.event.title)).toEqual(["Ping"]);
  expect(placement("Ping", placed).height).toBe(minimumBlockMinutes);
});

test("the grid opens on the whole hour before the first event, or at 7 AM", () => {
  expect(initialScrollMinutes([])).toBe(defaultScrollMinutes);
  expect(initialScrollMinutes([{ top: 9 * 60 + 45 }, { top: 14 * 60 }])).toBe(8 * 60);
  expect(initialScrollMinutes([{ top: 30 }])).toBe(0);
});
