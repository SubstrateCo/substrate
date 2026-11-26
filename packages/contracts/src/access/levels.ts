import { permissionLevels, type PermissionLevel } from "../tasks/status";

/** Whether `level` grants at least `minimum`. No level grants nothing. */
export function atLeast(level: PermissionLevel | null | undefined, minimum: PermissionLevel) {
  return !!level && permissionLevels.indexOf(level) >= permissionLevels.indexOf(minimum);
}

export const permissionLabels: Record<PermissionLevel, string> = {
  view: "Can view",
  comment: "Can comment",
  edit: "Can edit",
  owner: "Owner",
};

/**
 * CRM sharing names the owner level by what it allows, because a CRM record also has a
 * responsible owner who need not have access.
 */
export const crmAccessLabels: Record<PermissionLevel, string> = {
  ...permissionLabels,
  owner: "Can manage access",
};
