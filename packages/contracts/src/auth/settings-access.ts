import { storedRoles } from "./roles.ts";

export function organizationSettingsAccess(role?: string) {
  const roles = storedRoles(role);
  const isOwner = roles.includes("owner");
  return { allowed: isOwner || roles.includes("admin"), isOwner };
}
