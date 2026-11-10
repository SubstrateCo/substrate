import type { ProjectDetail } from "../types";

/**
 * Who a task can be assigned to. People need direct project access; your own agents use your
 * access. The current assignee stays in the list so the task keeps showing their name.
 */
export function assignableActors(detail: ProjectDetail, currentAssignee?: string | null) {
  return detail.actors.filter(
    (actor) =>
      actor.entityId === currentAssignee ||
      (actor.assignable &&
        (actor.type === "agent" ||
          detail.members.some((member) => member.actorEntityId === actor.entityId))),
  );
}
