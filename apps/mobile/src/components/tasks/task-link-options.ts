// Only use server-filtered project details. A failed read never leaves stale candidates.
export function taskLinkCandidates<T extends { entityId: string }>(
  detail: { project: { archivedAt: string | null }; tasks: T[] } | undefined,
  taskId: string,
) {
  if (!detail || detail.project.archivedAt) return [];
  return detail.tasks.filter((task) => task.entityId !== taskId);
}
