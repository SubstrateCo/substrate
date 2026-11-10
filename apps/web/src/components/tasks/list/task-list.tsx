import { taskStatusLabels, taskStatusValues, type TaskStatus } from "@startup-os/contracts/tasks";

import { useId, useState } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { TaskStatusIcon } from "../task-cues/task-status-icon";
import type { ProjectDetail } from "../types";
import {
  defaultTaskFilters,
  filterTasks,
  hasActiveFilters,
  type TaskFilters,
} from "./task-filters";
import { TaskListItem } from "./task-list-item";
import { TaskListToolbar } from "./task-list-toolbar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, ListTodo, Plus, SearchX } from "lucide-react";

/** A project's tasks: a filter bar, then one continuous list grouped by status. */
export function TaskList({
  detail,
  selectedId,
  onSelect,
  onCreate,
  onStatusChange,
}: {
  detail: ProjectDetail;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate?: (status?: TaskStatus) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
}) {
  const listId = useId();
  const [collapsed, setCollapsed] = useState<Partial<Record<TaskStatus, boolean>>>({});
  const [filters, setFilters] = useState<TaskFilters>(defaultTaskFilters);
  const actorsById = new Map(detail.actors.map((actor) => [actor.entityId, actor] as const));
  const tasksById = new Map(detail.tasks.map((task) => [task.entityId, task] as const));
  const assignees = detail.actors.filter((actor) =>
    detail.tasks.some((task) => task.assigneeActorEntityId === actor.entityId),
  );
  const filtered = hasActiveFilters(filters);
  const tasks = filterTasks(detail.tasks, filters);
  const clearFilters = () => setFilters({ ...filters, query: "", assignee: "any", scope: "all" });
  return (
    <section aria-label="Project tasks" className="@container flex min-h-0 min-w-0 flex-1 flex-col">
      {!!detail.tasks.length && (
        <TaskListToolbar
          filters={filters}
          onChange={setFilters}
          assignees={assignees}
          filtered={filtered}
          shown={tasks.length}
          total={detail.tasks.length}
        />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {!detail.tasks.length && (
          <ContentNotice
            icon={ListTodo}
            title="No tasks yet"
            description={
              onCreate
                ? "Break the project into tasks, then assign and schedule them."
                : "Tasks appear here when a project editor creates them."
            }
            action={onCreate && <Button onClick={() => onCreate()}>New task</Button>}
          />
        )}
        {!!detail.tasks.length && !tasks.length && (
          <ContentNotice
            icon={SearchX}
            title="No matching tasks"
            description="Try a different filter, or clear the filters to see every task."
            action={
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        )}
        {taskStatusValues.map((status) => {
          const rows = tasks.filter((task) => task.status === status);
          if (!rows.length) return null;
          const label = taskStatusLabels[status];
          const open = !collapsed[status];
          return (
            <div key={status} role="group" aria-labelledby={`${listId}-${status}-label`}>
              <div className="group/header sticky top-0 z-20 flex h-8 items-center gap-1 bg-muted/50 pr-6 pl-4">
                <h2 className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="flex h-6 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    aria-expanded={open}
                    aria-controls={`${listId}-${status}`}
                    onClick={() => setCollapsed((current) => ({ ...current, [status]: open }))}
                  >
                    <ChevronRight
                      aria-hidden="true"
                      className={`size-3 text-muted-foreground opacity-0 transition-transform duration-150 ease-out group-focus-within/header:opacity-100 group-hover/header:opacity-100 ${open ? "rotate-90" : ""}`}
                    />
                    <TaskStatusIcon status={status} className="size-3.5" />
                    <span id={`${listId}-${status}-label`}>{label}</span>
                    <span className="font-normal text-muted-foreground tabular-nums">
                      {rows.length}
                    </span>
                  </button>
                </h2>
                {onCreate && (
                  <span className="opacity-0 transition-opacity duration-150 group-hover/header:opacity-100 has-focus-visible:opacity-100">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Add task to ${label}`}
                          onClick={() => onCreate(status)}
                        >
                          <Plus aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Add task to {label}</TooltipContent>
                    </Tooltip>
                  </span>
                )}
              </div>
              <ul id={`${listId}-${status}`} hidden={!open}>
                {rows.map((task) => (
                  <TaskListItem
                    key={task.entityId}
                    task={task}
                    assignee={
                      task.assigneeActorEntityId
                        ? actorsById.get(task.assigneeActorEntityId)
                        : undefined
                    }
                    parentTitle={
                      task.parentTaskEntityId
                        ? tasksById.get(task.parentTaskEntityId)?.title
                        : undefined
                    }
                    selected={task.entityId === selectedId}
                    onSelect={() => onSelect(task.entityId)}
                    onStatusChange={
                      onStatusChange && ((next) => onStatusChange(task.entityId, next))
                    }
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
