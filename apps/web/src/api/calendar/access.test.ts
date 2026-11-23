import { ApiError } from "../result";
import { isCalendarAccessRequired } from "./access";
import { expect, test } from "bun:test";

test("only a missing calendar grant asks the user to reconnect", () => {
  const forbidden = (reason?: "CALENDAR_ACCESS_REQUIRED") =>
    new ApiError("FORBIDDEN", "Forbidden", 403, { reason });
  expect(isCalendarAccessRequired(forbidden("CALENDAR_ACCESS_REQUIRED"))).toBe(true);
  expect(isCalendarAccessRequired(forbidden())).toBe(false);
  expect(isCalendarAccessRequired(new Error("CALENDAR_ACCESS_REQUIRED"))).toBe(false);
  expect(isCalendarAccessRequired(null)).toBe(false);
});
