import { ValidationError } from "../../errors";

export type EventTiming = { timeZone: string } & (
  | { allDay: true; startsOn: string; endsOn: string }
  | { allDay: false; startsAt: Date; endsAt: Date }
);

export function validateTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw new ValidationError("A valid IANA time zone is required.");
  }
}

export function eventTimingColumns(timing: EventTiming) {
  validateTimeZone(timing.timeZone);
  switch (timing.allDay) {
    case true:
      return {
        allDay: true,
        timeZone: timing.timeZone,
        startsOn: timing.startsOn,
        endsOn: timing.endsOn,
        startsAt: null,
        endsAt: null,
      };
    case false:
      return {
        allDay: false,
        timeZone: timing.timeZone,
        startsAt: timing.startsAt,
        endsAt: timing.endsAt,
        startsOn: null,
        endsOn: null,
      };
    default:
      throw new ValidationError("An explicit all-day or timed event is required.");
  }
}
