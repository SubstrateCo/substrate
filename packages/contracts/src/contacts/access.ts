import type { EntityRules } from "../access/entity-rules.ts";

// Contacts belong to the whole organization. Every member edits every contact and its
// interactions, so contacts have no grants.
export const contactEntityRules = {
  contact: { apps: [], sharing: "members" },
  contact_interaction: { apps: [], parent: "contact" },
} as const satisfies EntityRules<"contact" | "contact_interaction">;
