import { directoryFilters, interactionPeriod, timelineFilters } from "./interaction-filters";
import { expect, test } from "bun:test";

test("a bounded interaction filter reads the requested rolling period", () => {
  expect(interactionPeriod("7", new Date("2026-11-25T12:00:00.000Z"))).toEqual({
    from: "2026-11-18T12:00:00.000Z",
    until: "2026-11-25T12:00:00.000Z",
  });
});

test("all-time interactions retain a valid API period but explicitly disable its restriction", () => {
  expect(interactionPeriod("all", new Date("2026-11-25T12:00:00.000Z"))).toEqual({
    from: "2026-10-26T12:00:00.000Z",
    until: "2026-11-25T12:00:00.000Z",
    allTime: "true",
  });
});

test("a timeline without filters reads every kind and origin for all time", () => {
  expect(timelineFilters({})).toEqual({ kind: undefined, days: "all", origin: undefined });
});

test("timeline filters map to the query's kind, period and origin", () => {
  expect(
    timelineFilters({ type: ["meeting"], period: ["30"], source: ["message_publication"] }),
  ).toEqual({ kind: "meeting", days: "30", origin: "message_publication" });
});

test("a directory without filters reads every record for all time", () => {
  expect(directoryFilters({})).toEqual({ days: "all", frequency: "all" });
  expect(directoryFilters({ period: ["7"], frequency: ["repeat"] })).toEqual({
    days: "7",
    frequency: "repeat",
  });
});
