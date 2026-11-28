import type { EntityRules } from "../access/entity-rules.ts";

export const crmEntityRules = {
  account: { apps: ["crm"], sharing: "admins" },
  deal: { apps: ["crm"], sharing: "admins" },
} as const satisfies EntityRules<"account" | "deal">;
