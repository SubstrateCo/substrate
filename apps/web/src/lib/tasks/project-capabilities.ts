import type { PermissionLevel } from "@substrate/contracts/tasks";

export function projectCapabilities(level: PermissionLevel | null | undefined) {
  const canManage = level === "owner";
  const canEdit = canManage || level === "edit";
  return {
    canEdit,
    canComment: canEdit || level === "comment",
    canManage,
  };
}

export type ProjectCapabilities = ReturnType<typeof projectCapabilities>;
