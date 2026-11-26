import { interactionPeriod } from "./interaction-filters";
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
