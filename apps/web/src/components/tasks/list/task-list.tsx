import { taskStatusLabels, taskStatusValues, type TaskStatus } from "@substrate/contracts/tasks";

import { useId, useState, type ReactNode } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { TaskBoard } from "../board/task-board";
import { blockedTaskIds } from "../links/task-relations";
import { TaskStatusIcon } from "../task-cues/task-status-icon";
import type { ProjectDetail } from "../types";
import {
  defaultTaskFilters,
  filterTasks,
  hasActiveFilters,
  type TaskFilters,
} from "./task-filters";
import { TaskListItem } from "./task-list-item";
import { TaskFilterLayout, TaskGroupHeaderLayout } from "./task-list-layout";
import { TaskListToolbar } from "./task-list-toolbar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, ListTodo, Plus, SearchX } from "lucide-react";

/** A project's tasks, shown as a status-grouped list or board with shared filters. */
export function TaskList({
  detail,
  view,
  viewControl,
  selectedId,
  onSelect,
  onCreate,
  onStatusChange,
  statusPending = false,
}: {
  detail: ProjectDetail;
  view: "list" | "board";
  /** The List/Board toggle, at the right end of the toolbar. */
  viewControl?: ReactNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate?: (status?: TaskStatus) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  statusPending?: boolean;
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
  const blocked = blockedTaskIds(detail.links, detail.tasks);
  const tasks = filterTasks(detail.tasks, filters, blocked);
  const noMatches = filtered && !tasks.length;
  const tasksByStatus = new Map<TaskStatus, typeof tasks>();
  for (const task of tasks) {
    const rows = tasksByStatus.get(task.status);
    if (rows) rows.push(task);
    else tasksByStatus.set(task.status, [task]);
  }
  const clearFilters = () => setFilters({ ...filters, query: "", assignee: "any", scope: "all" });
  return (
    <section aria-label="Project tasks" className="@container flex min-h-0 min-w-0 flex-1 flex-col">
      {/* An empty project has nothing to filter, but keeps the view toggle in its place. */}
      {!detail.tasks.length && viewControl && (
        <TaskFilterLayout>
          <div className="ml-auto">{viewControl}</div>
        </TaskFilterLayout>
      )}
      {!!detail.tasks.length && (
        <TaskListToolbar
          filters={filters}
          onChange={setFilters}
          assignees={assignees}
          filtered={filtered}
          shown={tasks.length}
          total={detail.tasks.length}
          viewControl={viewControl}
        />
      )}
      {noMatches && (
        <div className="min-h-0 flex-1 overflow-y-auto">
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
        </div>
      )}
      {!noMatches && view === "board" && (
        <TaskBoard
          detail={detail}
          tasks={tasks}
          selectedId={selectedId}
          onSelect={onSelect}
          onCreate={onCreate}
          onStatusChange={onStatusChange}
          statusPending={statusPending}
        />
      )}
      {!noMatches && view === "list" && (
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
          {taskStatusValues.map((status) => {
            const rows = tasksByStatus.get(status);
            if (!rows) return null;
            const label = taskStatusLabels[status];
            const open = !collapsed[status];
            return (
              <div key={status} role="group" aria-labelledby={`${listId}-${status}-label`}>
                <TaskGroupHeaderLayout>
                  <h2 className="min-w-0 flex-1">
                    <button
                      type="button"
                      className="flex h-8 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      aria-expanded={open}
                      aria-controls={`${listId}-${status}`}
                      onClick={() => setCollapsed((current) => ({ ...current, [status]: open }))}
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={`size-3 text-muted-foreground opacity-0 transition-transform duration-150 ease-out group-focus-within/header:opacity-100 group-hover/header:opacity-100 ${open ? "rotate-90" : ""}`}
                      />
                      <TaskStatusIcon status={status} />
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
                </TaskGroupHeaderLayout>
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
                      blocked={blocked.has(task.entityId)}
                      selected={task.entityId === selectedId}
                      statusPending={statusPending}
                      onSelect={() => onSelect(task.entityId)}
                      onStatusChange={
                        onStatusChange ? (next) => onStatusChange(task.entityId, next) : undefined
                      }
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
