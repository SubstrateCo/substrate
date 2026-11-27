import { taskStatusValues, type TaskStatus } from "@substrate/contracts/tasks";

import { useId, useState, type ReactNode } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { TaskBoard } from "../board/task-board";
import { blockedTaskIds } from "../links/task-relations";
import type { ProjectDetail, Task } from "../types";
import {
  clearedFilters,
  defaultTaskFilters,
  filterTasks,
  hasActiveFilters,
  type TaskFilters,
} from "./task-filters";
import { TaskListItem } from "./task-list-item";
import { TaskFilterLayout } from "./task-list-layout";
import { TaskListToolbar } from "./task-list-toolbar";
import { TaskStatusGroup } from "./task-status-group";
import { Button } from "@/components/ui/button";
import { ListTodo, Plus, SearchX } from "lucide-react";

type TaskCues = (task: Task) => {
  assignee: ProjectDetail["actors"][number] | undefined;
  parentTitle: string | undefined;
  blocked: boolean;
};

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
  const cues: TaskCues = (task) => ({
    assignee: task.assigneeActorEntityId ? actorsById.get(task.assigneeActorEntityId) : undefined,
    parentTitle: task.parentTaskEntityId
      ? tasksById.get(task.parentTaskEntityId)?.title
      : undefined,
    blocked: blocked.has(task.entityId),
  });
  return (
    <section aria-label="Project tasks" className="@container flex min-h-0 min-w-0 flex-1 flex-col">
      {detail.tasks.length ? (
        <TaskListToolbar
          filters={filters}
          onChange={setFilters}
          assignees={assignees}
          filtered={filtered}
          shown={tasks.length}
          total={detail.tasks.length}
          viewControl={viewControl}
        />
      ) : (
        // An empty project has nothing to filter, but keeps the view toggle in its place.
        viewControl && (
          <TaskFilterLayout>
            <div className="ml-auto">{viewControl}</div>
          </TaskFilterLayout>
        )
      )}
      <TaskListBody
        view={view}
        empty={!detail.tasks.length}
        noMatches={filtered && !tasks.length}
        tasks={tasks}
        cues={cues}
        selectedId={selectedId}
        onSelect={onSelect}
        onCreate={onCreate}
        onStatusChange={onStatusChange}
        statusPending={statusPending}
        collapsed={collapsed}
        onToggle={(status, collapse) =>
          setCollapsed((current) => ({ ...current, [status]: collapse }))
        }
        onClearFilters={() => setFilters(clearedFilters(filters))}
      />
    </section>
  );
}

function TaskListBody({
  view,
  empty,
  noMatches,
  tasks,
  onClearFilters,
  onCreate,
  collapsed,
  onToggle,
  ...rows
}: {
  view: "list" | "board";
  /** The project has no tasks at all. */
  empty: boolean;
  /** Filters hide every task. */
  noMatches: boolean;
  tasks: Task[];
  cues: TaskCues;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate?: (status?: TaskStatus) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  statusPending: boolean;
  collapsed: Partial<Record<TaskStatus, boolean>>;
  onToggle: (status: TaskStatus, collapse: boolean) => void;
  onClearFilters: () => void;
}) {
  if (noMatches) return <NoMatchingTasks onClearFilters={onClearFilters} />;
  // Empty board columns are where a new project's first tasks are created in their status.
  if (view === "board") return <TaskBoard tasks={tasks} onCreate={onCreate} {...rows} />;
  if (empty) return <EmptyProject onCreate={onCreate} />;
  return (
    <TaskStatusGroups
      tasks={tasks}
      onCreate={onCreate}
      collapsed={collapsed}
      onToggle={onToggle}
      {...rows}
    />
  );
}

function NoMatchingTasks({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ContentNotice
        icon={SearchX}
        title="No matching tasks"
        description="Try a different filter, or clear the filters to see every task."
        action={
          <Button variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    </div>
  );
}

function EmptyProject({ onCreate }: { onCreate?: (status?: TaskStatus) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ContentNotice
        icon={ListTodo}
        title="No tasks yet"
        description={
          onCreate
            ? "Break the project into tasks, then assign and schedule them."
            : "Tasks appear here when a project editor creates them."
        }
        action={
          onCreate && (
            <Button onClick={() => onCreate()}>
              <Plus aria-hidden />
              New task
            </Button>
          )
        }
      />
    </div>
  );
}

function TaskStatusGroups({
  tasks,
  cues,
  selectedId,
  onSelect,
  onCreate,
  onStatusChange,
  statusPending,
  collapsed,
  onToggle,
}: {
  tasks: Task[];
  cues: TaskCues;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate?: (status?: TaskStatus) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  statusPending: boolean;
  collapsed: Partial<Record<TaskStatus, boolean>>;
  onToggle: (status: TaskStatus, collapse: boolean) => void;
}) {
  const listId = useId();
  const tasksByStatus = new Map<TaskStatus, Task[]>();
  for (const task of tasks) {
    const rows = tasksByStatus.get(task.status);
    if (rows) rows.push(task);
    else tasksByStatus.set(task.status, [task]);
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-6">
      {taskStatusValues.map((status) => {
        const rows = tasksByStatus.get(status);
        if (!rows) return null;
        const open = !collapsed[status];
        return (
          <TaskStatusGroup
            key={status}
            id={`${listId}-${status}`}
            status={status}
            count={rows.length}
            open={open}
            onToggle={() => onToggle(status, open)}
            onCreate={onCreate}
          >
            {rows.map((task) => (
              <TaskListItem
                key={task.entityId}
                task={task}
                {...cues(task)}
                selected={task.entityId === selectedId}
                statusPending={statusPending}
                onSelect={() => onSelect(task.entityId)}
                onStatusChange={
                  onStatusChange ? (next) => onStatusChange(task.entityId, next) : undefined
                }
              />
            ))}
          </TaskStatusGroup>
        );
      })}
    </div>
  );
}
