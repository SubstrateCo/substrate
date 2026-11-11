import { routineErrors, type RoutineDraft } from "./routine-draft";
import { describe, expect, test } from "bun:test";

const valid: RoutineDraft = {
  name: "Weekly digest",
  prompt: "Summarize open threads.",
  cron: "0 9 * * 1",
  timezone: "Europe/Berlin",
  enabled: true,
};

describe("routine draft errors", () => {
  test("a complete draft has no errors", () => {
    expect(routineErrors(valid)).toEqual({});
  });

  test("names each invalid field in form order", () => {
    const errors = routineErrors({ ...valid, name: " ", prompt: "", cron: "0 9 *", timezone: "" });
    expect(Object.keys(errors)).toEqual(["name", "prompt", "cron", "timezone"]);
  });

  test("rejects text longer than the routine contract allows", () => {
    const errors = routineErrors({
      ...valid,
      name: "n".repeat(201),
      prompt: "p".repeat(20_001),
      cron: `0 9 * * ${"1,".repeat(50)}1`,
    });
    expect(errors).toEqual({
      name: "Use a routine name of 200 characters or fewer.",
      prompt: "Use 20,000 characters or fewer.",
      cron: "Use 100 characters or fewer.",
    });
  });

  test("rejects a time zone the runtime doesn't know", () => {
    expect(routineErrors({ ...valid, timezone: "Mars/Olympus" })).toEqual({
      timezone: "Choose a time zone.",
    });
  });
});
