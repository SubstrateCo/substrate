export function moveParentChoices(
  tasks: { entityId: string; parentTaskEntityId: string | null; title: string }[],
  taskId: string,
) {
  const excluded = new Set([taskId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (
        task.parentTaskEntityId &&
        excluded.has(task.parentTaskEntityId) &&
        !excluded.has(task.entityId)
      ) {
        excluded.add(task.entityId);
        changed = true;
      }
    }
  }
  return tasks.filter((task) => !excluded.has(task.entityId));
}
