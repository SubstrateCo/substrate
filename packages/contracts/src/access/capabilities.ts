import type { PermissionLevel } from "../tasks/status";
import { atLeast } from "./levels";

export type RecordAccess = { level: PermissionLevel | null | undefined; archived: boolean };

/** What the reader may do in a record. An archived record is read-only until it is restored. */
export function entityCapabilities({ level, archived }: RecordAccess) {
  return {
    canEdit: !archived && atLeast(level, "edit"),
    canManageAccess: !archived && atLeast(level, "owner"),
  };
}

/** Only project owners archive, restore, or delete a project. */
export function projectCapabilities(access: RecordAccess) {
  return { ...entityCapabilities(access), canArchive: atLeast(access.level, "owner") };
}

export type ProjectCapabilities = ReturnType<typeof projectCapabilities>;

/** Editors of a CRM record archive and restore it, and reassign responsibility while it is active. */
export function crmRecordCapabilities(access: RecordAccess) {
  const capabilities = entityCapabilities(access);
  return {
    ...capabilities,
    canReassign: capabilities.canEdit,
    canArchive: atLeast(access.level, "edit"),
  };
}

export type CrmRecordCapabilities = ReturnType<typeof crmRecordCapabilities>;
