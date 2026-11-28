import {
  taskLinkRelation,
  taskLinkRelations,
  type TaskLinkEnd,
  type TaskLinkRelation,
  TaskLinkView,
} from "@substrate/contracts/tasks/links";

import type { Task } from "../types";
import { isClosedTask } from "@/lib/tasks/task-status";

export interface TaskRelation {
  id: string;
  relation: TaskLinkRelation;
  other: TaskLinkEnd | null;
  blocking: boolean;
}

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

export function descendantIds(tasks: readonly Task[], taskEntityId: string) {
  const descendants = new Set<string>();
  const pending = [taskEntityId];
  for (let parent = pending.pop(); parent !== undefined; parent = pending.pop()) {
    for (const task of tasks) {
      if (
        task.parentTaskEntityId !== parent ||
        task.entityId === taskEntityId ||
        descendants.has(task.entityId)
      )
        continue;
      descendants.add(task.entityId);
      pending.push(task.entityId);
    }
  }
  return descendants;
}

export function blockedTaskIds(links: readonly TaskLinkView[], tasks: readonly Task[]) {
  const open = new Set(tasks.flatMap((task) => (isClosedTask(task) ? [] : [task.entityId])));
  return new Set(
    links.flatMap((link) =>
      link.kind === "blocks" && link.blocking && link.target && open.has(link.target.entityId)
        ? [link.target.entityId]
        : [],
    ),
  );
}
