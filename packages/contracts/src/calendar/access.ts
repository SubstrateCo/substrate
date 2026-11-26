import type { EntityRules } from "../access/entity-rules.ts";

// Calendars are personal, so admins do not own them. Events use their calendar's access.
export const calendarEntityRules = {
  calendar: { apps: ["calendar"], sharing: "grants" },
  calendar_event: { apps: ["calendar"], parent: "calendar" },
} as const satisfies EntityRules<"calendar" | "calendar_event">;
