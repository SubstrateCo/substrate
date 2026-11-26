import { interactionMinutes } from "./interaction-duration";
import { expect, test } from "bun:test";

test("changing a timed interaction to a note ignores its hidden invalid duration", () => {
  expect(interactionMinutes("call", "0")).toBeNull();
  expect(interactionMinutes("note", "0")).toBe(0);
  expect(interactionMinutes("message", "invalid")).toBe(0);
});

test("calls and meetings accept only optional positive whole-minute durations", () => {
  expect(interactionMinutes("call", "")).toBe(0);
  expect(interactionMinutes("meeting", "90")).toBe(90);
  expect(interactionMinutes("call", "-1")).toBeNull();
  expect(interactionMinutes("call", "1.5")).toBeNull();
  expect(interactionMinutes("meeting", "10000")).toBeNull();
});
