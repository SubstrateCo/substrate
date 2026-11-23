import { ApiError } from "../result";

/** The provider account no longer grants calendar access; the user must reconnect it. */
export function isCalendarAccessRequired(error: Error | null | undefined) {
  return error instanceof ApiError && error.reason === "CALENDAR_ACCESS_REQUIRED";
}
