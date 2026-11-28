import type { EntityRules } from "../access/entity-rules.ts";

export const taskEntityRules = {
  project: { apps: ["tasks"], sharing: "admins" },
  task: { apps: ["tasks"], parent: "project" },
} as const satisfies EntityRules<"project" | "task">;
