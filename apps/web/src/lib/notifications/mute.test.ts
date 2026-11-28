import { mutedIndefinitely } from "@substrate/contracts/notifications/alerts";

import { muteState, muteUntil } from "./mute";
import { expect, test } from "bun:test";

const now = new Date(2026, 10, 27, 22, 15);

test("a timed mute ends after its duration", () => {
  expect(muteUntil("1h", now)).toBe(new Date(2026, 10, 27, 23, 15).toISOString());
  expect(muteUntil("30m", now)).toBe(new Date(2026, 10, 27, 22, 45).toISOString());
});

test("a mute until tomorrow ends at 9:00 AM local time on the next day", () => {
  expect(muteUntil("tomorrow", now)).toBe(new Date(2026, 10, 28, 9, 0).toISOString());
  const endOfMonth = new Date(2026, 10, 30, 1, 0);
  expect(muteUntil("tomorrow", endOfMonth)).toBe(new Date(2026, 11, 1, 9, 0).toISOString());
});

test("off clears the mute, and forever stores the indefinite end", () => {
  expect(muteUntil("off", now)).toBeNull();
  expect(muteUntil("forever", now)).toBe(mutedIndefinitely);
});

test("a past end reads as off, so an expired mute does not show as active", () => {
  expect(muteState(new Date(2026, 10, 27, 21, 0).toISOString(), now)).toEqual({ kind: "off" });
  expect(muteState(null, now)).toEqual({ kind: "off" });
  expect(muteState(mutedIndefinitely, now)).toEqual({ kind: "forever" });
  const until = new Date(2026, 10, 28, 9, 0).toISOString();
  expect(muteState(until, now)).toEqual({ kind: "until", until });
});
