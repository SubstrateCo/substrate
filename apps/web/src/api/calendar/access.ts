import { ApiError } from "../result";

export function isCalendarAccessRequired(error: Error | null | undefined) {
  return error instanceof ApiError && error.reason === "CALENDAR_ACCESS_REQUIRED";
}
