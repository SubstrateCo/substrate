import { entityAccessRules, type EntityType } from "../access/entity-rules.ts";
import { organizationId } from "../workspace.ts";
import { z } from "zod";

export const optionalAppIds = ["tasks", "crm", "calendar", "inbox"] as const;
export const userAppIds = ["inbox"] as const;
export type UserAppId = (typeof userAppIds)[number];
export const organizationOptionalAppIds = ["tasks", "crm", "calendar"] as const;
export type OrganizationOptionalAppId = (typeof organizationOptionalAppIds)[number];
export type OptionalAppId = (typeof optionalAppIds)[number];
export const isOptionalApp = (id: string): id is OptionalAppId =>
  optionalAppIds.some((app) => app === id);
export const coreAppIds = ["messages", "agents"] as const;
export const appIds = [...coreAppIds, ...optionalAppIds] as const;
export type AppId = (typeof appIds)[number];
export const organizationAppIds = [...coreAppIds, ...organizationOptionalAppIds] as const;
export type OrganizationAppId = (typeof organizationAppIds)[number];
export type AppScope = "organization" | "user";

export function appScope(app: AppId): AppScope {
  return userAppIds.some((id) => id === app) ? "user" : "organization";
}

export interface AppSettings {
  organizationId: string;
  enabledApps: AppId[];
}

export function appEnabled(enabledApps: readonly AppId[], app: AppId): boolean {
  return coreAppIds.some((core) => core === app) || enabledApps.includes(app);
}

export function requiredAppsForEntityType(type: string): readonly OptionalAppId[] {
  // SAFETY: The own-property check proves that type is one of the map's keys.
  return Object.hasOwn(entityAccessRules, type) ? entityAccessRules[type as EntityType].apps : [];
}

export const appsWorkspace = z.object({ organizationId });
export const updateApps = appsWorkspace.extend({
  enabledApps: z
    .array(z.enum(organizationAppIds))
    .max(organizationAppIds.length)
    .refine(
      (apps) => new Set(apps).size === apps.length && coreAppIds.every((app) => apps.includes(app)),
      "Core apps must stay enabled and apps must be unique.",
    ),
});

export const updateUserApp = appsWorkspace
  .extend({
    appId: z.enum(userAppIds),
    enabled: z.boolean(),
  })
  .strict();
