export function organizationSettingsAccess(role?: string) {
  const roles = role?.split(",") ?? [];
  const isOwner = roles.includes("owner");
  return { allowed: isOwner || roles.includes("admin"), isOwner };
}
