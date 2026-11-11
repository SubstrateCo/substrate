type ProjectLevel = "view" | "comment" | "edit" | "owner";

export function projectCapabilities(level: ProjectLevel | null | undefined) {
  const canManage = level === "owner";
  const canEdit = canManage || level === "edit";
  return {
    canEdit,
    canComment: canEdit || level === "comment",
    canManage,
  };
}

export type ProjectCapabilities = ReturnType<typeof projectCapabilities>;
