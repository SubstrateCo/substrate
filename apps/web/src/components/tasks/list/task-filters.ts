import { taskPriorityOrder } from "../task-cues/task-labels";
import type { Task } from "../types";

export type TaskSort = "default" | "priority" | "dueDate" | "title";

export type TaskFilters = {
  query: string;
  /** "any", "unassigned", or an actor entity ID. */
  assignee: string;
  /** "active" hides completed and canceled tasks. */
  scope: "all" | "active";
  sort: TaskSort;
};

export const defaultTaskFilters: TaskFilters = {
  query: "",
  assignee: "any",
  scope: "all",
  sort: "default",
};

export function hasActiveFilters(filters: TaskFilters) {
  return !!filters.query.trim() || filters.assignee !== "any" || filters.scope !== "all";
}

const closed = new Set<Task["status"]>(["completed", "canceled"]);

const comparers: Record<Exclude<TaskSort, "default">, (a: Task, b: Task) => number> = {
  priority: (a, b) => taskPriorityOrder.indexOf(a.priority) - taskPriorityOrder.indexOf(b.priority),
  // Dated tasks first, soonest first. Date-only strings sort as text.
  dueDate: (a, b) => {
    if (a.dueDate === b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  },
  title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
};

/** The tasks that match the filters, in the chosen order. The default order is the server's. */
export function filterTasks(tasks: readonly Task[], filters: TaskFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  const matches = tasks.filter(
    (task) =>
      (!query || task.title.toLocaleLowerCase().includes(query)) &&
      (filters.scope === "all" || !closed.has(task.status)) &&
      (filters.assignee === "any" ||
        (filters.assignee === "unassigned"
          ? !task.assigneeActorEntityId
          : task.assigneeActorEntityId === filters.assignee)),
  );
  return filters.sort === "default" ? matches : matches.sort(comparers[filters.sort]);
}
