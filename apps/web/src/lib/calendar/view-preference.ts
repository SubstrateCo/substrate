import type { CalendarViewMode } from "./days";

const storageKey = "substrate:calendar:view";

export function readCalendarView(): CalendarViewMode {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === "agenda" || value === "week" || value === "month") return value;
  } catch {
    // The calendar still works when device storage is unavailable.
  }
  return "agenda";
}

export function saveCalendarView(view: CalendarViewMode) {
  try {
    localStorage.setItem(storageKey, view);
  } catch {
    // A storage failure must not block changing the view.
  }
}
