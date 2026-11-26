import type { ProjectDetail } from "@/features/records/requests";

export function taskAssignees(
  detail: Pick<ProjectDetail, "actors" | "members">,
  current?: string | null,
) {
  return detail.actors.filter(
    (actor) =>
      actor.entityId === current ||
      (actor.assignable &&
        (actor.type === "agent" ||
          detail.members.some((member) => member.actorEntityId === actor.entityId))),
  );
}

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
