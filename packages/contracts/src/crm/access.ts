import type { EntityRules } from "../access/entity-rules.ts";

// Accounts and deals are shared with grants. Organization owners and admins own all of them.
export const crmEntityRules = {
  account: { apps: ["crm"], sharing: "admins" },
  deal: { apps: ["crm"], sharing: "admins" },
} as const satisfies EntityRules<"account" | "deal">;
