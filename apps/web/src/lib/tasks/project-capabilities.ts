import type { PermissionLevel } from "@substrate/contracts/tasks";

/** An archived project is read-only: its owners can only restore or delete it. */
export function projectCapabilities(level: PermissionLevel | null | undefined, archived = false) {
  const owner = level === "owner";
  const canEdit = !archived && (owner || level === "edit");
  return {
    canEdit,
    canComment: canEdit || (!archived && level === "comment"),
    canManage: !archived && owner,
    canArchive: owner,
  };
}

export type ProjectCapabilities = ReturnType<typeof projectCapabilities>;
