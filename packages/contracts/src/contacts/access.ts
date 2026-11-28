import type { EntityRules } from "../access/entity-rules.ts";

export const contactEntityRules = {
  contact: { apps: [], sharing: "members" },
  contact_interaction: { apps: [], parent: "contact" },
} as const satisfies EntityRules<"contact" | "contact_interaction">;
