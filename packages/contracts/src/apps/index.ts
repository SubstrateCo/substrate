import { organizationId } from "../workspace.ts";
import { z } from "zod";

export const optionalAppIds = ["tasks", "crm", "calendar", "inbox"] as const;
export type OptionalAppId = (typeof optionalAppIds)[number];
export const isOptionalApp = (id: string): id is OptionalAppId =>
  optionalAppIds.some((app) => app === id);
export const coreAppIds = ["messages", "agents"] as const;
export const appIds = [...coreAppIds, ...optionalAppIds] as const;
export type AppId = (typeof appIds)[number];

export interface AppSettings {
  organizationId: string;
  enabledApps: AppId[];
}

export function appEnabled(enabledApps: readonly AppId[], app: AppId): boolean {
  return app === "messages" || app === "agents" || enabledApps.includes(app);
}

const entityApps = {
  project: ["tasks"],
  task: ["tasks"],
  account: ["crm"],
  deal: ["crm"],
  calendar: ["calendar"],
  calendar_event: ["calendar"],
} as const satisfies Record<string, readonly AppId[]>;

export function requiredAppsForEntityType(type: string): readonly AppId[] {
  // SAFETY: The own-property check proves that type is one of the map's keys.
  return Object.hasOwn(entityApps, type) ? entityApps[type as keyof typeof entityApps] : [];
}

export const appsWorkspace = z.object({ organizationId });
export const updateApps = appsWorkspace.extend({
  enabledApps: z
    .array(z.enum(appIds))
    .max(appIds.length)
    .refine(
      (apps) => new Set(apps).size === apps.length && coreAppIds.every((app) => apps.includes(app)),
      "Core apps must stay enabled and apps must be unique.",
    ),
});
