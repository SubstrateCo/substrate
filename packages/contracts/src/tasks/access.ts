import type { EntityRules } from "../access/entity-rules.ts";

// Organization owners and admins own every project. Tasks use their project's access.
export const taskEntityRules = {
  project: { apps: ["tasks"], sharing: "admins" },
  task: { apps: ["tasks"], parent: "project" },
} as const satisfies EntityRules<"project" | "task">;
