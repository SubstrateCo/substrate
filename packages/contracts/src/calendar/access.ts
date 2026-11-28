import type { EntityRules } from "../access/entity-rules.ts";

export const calendarEntityRules = {
  calendar: { apps: ["calendar"], sharing: "grants" },
  calendar_event: { apps: ["calendar"], parent: "calendar" },
} as const satisfies EntityRules<"calendar" | "calendar_event">;
