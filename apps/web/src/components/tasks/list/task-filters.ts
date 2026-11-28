import { taskPriorityOrder } from "../task-cues/task-labels";
import type { Task } from "../types";
import type { FilterValue } from "@/components/filters";
import { isClosedTask } from "@/lib/tasks/task-status";

export type TaskSort = "default" | "priority" | "dueDate" | "title";

export type TaskFilters = {
  query: string;
  assignee: string;
  scope: "all" | "active" | "blocked";
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

export function clearedFilters(filters: TaskFilters): TaskFilters {
  return { ...filters, query: "", assignee: "any", scope: "all" };
}

export type TaskFilterFieldId = "scope" | "assignee";

const scopes = ["active", "blocked"] as const;

export function taskFilterValue(filters: TaskFilters): FilterValue<TaskFilterFieldId> {
  const value: FilterValue<TaskFilterFieldId> = {};
  if (filters.scope !== "all") value.scope = { operator: "is", values: [filters.scope] };
  if (filters.assignee !== "any") value.assignee = { operator: "is", values: [filters.assignee] };
  return value;
}

export function withTaskFilterValue(
  filters: TaskFilters,
  value: FilterValue<TaskFilterFieldId>,
): TaskFilters {
  const scope = scopes.find((candidate) => candidate === value.scope?.values[0]) ?? "all";
  return { ...filters, scope, assignee: value.assignee?.values[0] ?? "any" };
}

const comparers: Record<Exclude<TaskSort, "default">, (a: Task, b: Task) => number> = {
  priority: (a, b) => taskPriorityOrder.indexOf(a.priority) - taskPriorityOrder.indexOf(b.priority),
  dueDate: (a, b) => {
    if (a.dueDate === b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  },
  title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
};

export function filterTasks(
  tasks: readonly Task[],
  filters: TaskFilters,
  blocked: ReadonlySet<string> = new Set(),
) {
  const query = filters.query.trim().toLocaleLowerCase();
  const matches = tasks.filter(
    (task) =>
      (!query || task.title.toLocaleLowerCase().includes(query)) &&
      (filters.scope === "all" || !isClosedTask(task)) &&
      (filters.scope !== "blocked" || blocked.has(task.entityId)) &&
      (filters.assignee === "any" ||
        (filters.assignee === "unassigned"
          ? !task.assigneeActorEntityId
          : task.assigneeActorEntityId === filters.assignee)),
  );
  return filters.sort === "default" ? matches : matches.sort(comparers[filters.sort]);
}
