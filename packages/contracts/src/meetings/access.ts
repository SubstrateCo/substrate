import type { EntityRules } from "../access/entity-rules.ts";

// Meeting archives are personal, so admins do not own them. Meetings use their archive's access.
export const meetingEntityRules = {
  meeting_archive: { apps: ["meetings"], sharing: "grants" },
  meeting: { apps: ["meetings"], parent: "meeting_archive" },
} as const satisfies EntityRules<"meeting_archive" | "meeting">;
