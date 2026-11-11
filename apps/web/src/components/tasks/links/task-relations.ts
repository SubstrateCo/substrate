import {
  taskLinkRelation,
  taskLinkRelations,
  type TaskLinkEnd,
  type TaskLinkRelation,
  TaskLinkView,
} from "@startup-os/contracts/tasks/links";

import type { Task } from "../types";

const closed = new Set<Task["status"]>(["completed", "canceled"]);

export interface TaskRelation {
  id: string;
  relation: TaskLinkRelation;
  /** The other task, or null when the reader cannot open it. */
  other: TaskLinkEnd | null;
  /** The other task is open and blocks this one. */
  blocking: boolean;
}

/** A task's links as the task sees them, grouped in the standard relation order. */
export function taskRelations(
  links: readonly TaskLinkView[],
  taskEntityId: string,
): TaskRelation[] {
  const relations = links.flatMap((link): TaskRelation[] => {
    let side: "source" | "target";
    if (link.source?.entityId === taskEntityId) side = "source";
    else if (link.target?.entityId === taskEntityId) side = "target";
    else return [];
    const relation = taskLinkRelation(link.kind, side);
    return [
      {
        id: link.id,
        relation,
        other: side === "source" ? link.target : link.source,
        blocking: relation === "blocked_by" && link.blocking,
      },
    ];
  });
  return relations.sort(
    (a, b) => taskLinkRelations.indexOf(a.relation) - taskLinkRelations.indexOf(b.relation),
  );
}

/** Open tasks that an open task blocks. A closed task is never shown as blocked. */
export function blockedTaskIds(links: readonly TaskLinkView[], tasks: readonly Task[]) {
  const open = new Set(tasks.flatMap((task) => (closed.has(task.status) ? [] : [task.entityId])));
  return new Set(
    links.flatMap((link) =>
      link.kind === "blocks" && link.blocking && link.target && open.has(link.target.entityId)
        ? [link.target.entityId]
        : [],
    ),
  );
}
