import type { FilterValue } from "@/components/filters";
import type { CalendarGroup } from "@/lib/calendar/groups";

export type CalendarFilterFieldId = "calendar";

/**
 * The hidden calendars as a "Calendar is not" clause, in the order they were hidden. Calendars
 * that are no longer listed are left out, so the pill never names an unknown calendar.
 */
export function hiddenCalendarsValue(
  hidden: ReadonlySet<string>,
  groups: readonly CalendarGroup[],
): FilterValue<CalendarFilterFieldId> {
  const listed = new Set(groups.flatMap((group) => group.calendars.map((c) => c.entityId)));
  const values = [...hidden].filter((id) => listed.has(id));
  return values.length ? { calendar: { operator: "is not", values } } : {};
}

/** The hidden calendars taken from the filter bar's "Calendar is not" clause. */
export function hiddenCalendarsFrom(value: FilterValue<CalendarFilterFieldId>): Set<string> {
  return new Set(value.calendar?.values);
}
