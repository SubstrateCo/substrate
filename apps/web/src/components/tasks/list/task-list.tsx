import { taskStatusLabels, taskStatusValues, type TaskStatus } from "@startup-os/contracts/tasks";

import { useId, useState } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { TaskStatusIcon } from "../task-cues/task-status-icon";
import type { ProjectDetail } from "../types";
import { TaskListItem } from "./task-list-item";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";

export function TaskList({
  detail,
  selectedId,
  onSelect,
  onCreate,
}: {
  detail: ProjectDetail;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate?: (status: TaskStatus) => void;
}) {
  const listId = useId();
  const [collapsed, setCollapsed] = useState<Partial<Record<TaskStatus, boolean>>>({});
  const actorsById = new Map(detail.actors.map((actor) => [actor.entityId, actor] as const));
  const tasksById = new Map(detail.tasks.map((task) => [task.entityId, task] as const));
  return (
    <section
      aria-label="Project tasks"
      className="@container min-h-0 min-w-0 space-y-4 md:h-full md:overflow-y-auto"
    >
      {!detail.tasks.length && (
        <ContentNotice
          title="No tasks yet"
          description={
            detail.level === "edit" || detail.level === "owner"
              ? "Create the first task for this project."
              : "Tasks will appear here when a project editor creates them."
          }
        />
      )}
      {!!detail.tasks.length && (
        <div
          aria-hidden="true"
          className="hidden gap-3 border-b px-3 pb-2 text-xs text-muted-foreground @xl:flex"
        >
          <span className="min-w-0 flex-1">Task</span>
          <span className="w-24 shrink-0">Priority</span>
          <span className="w-32 shrink-0">Assignee</span>
          <span className="w-24 shrink-0">Due date</span>
        </div>
      )}
      {taskStatusValues.map((status) => {
        const rows = detail.tasks.filter((task) => task.status === status);
        if (!rows.length) return null;
        return (
          <div key={status} className="overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-2 border-b bg-muted py-2 pr-3 pl-1">
              <h2 className="min-w-0 flex-1 text-xs font-semibold tracking-wide wrap-anywhere uppercase">
                <Button
                  variant="disclosure"
                  size="xs"
                  className="w-full justify-start"
                  aria-label={taskStatusLabels[status]}
                  aria-expanded={!collapsed[status]}
                  aria-controls={`${listId}-${status}`}
                  onClick={() =>
                    setCollapsed((current) => ({ ...current, [status]: !current[status] }))
                  }
                >
                  <TaskStatusIcon status={status} />
                  <span className="w-24 shrink-0 text-left font-semibold tracking-wide uppercase">
                    {taskStatusLabels[status]}
                  </span>{" "}
                  <span className="rounded bg-muted px-1.5 py-0.5 font-normal text-muted-foreground tabular-nums">
                    {rows.length}
                  </span>
                  {collapsed[status] ? (
                    <ChevronRight aria-hidden="true" />
                  ) : (
                    <ChevronDown aria-hidden="true" />
                  )}
                </Button>
              </h2>
              {onCreate && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Add ${taskStatusLabels[status]} task`}
                  onClick={() => onCreate(status)}
                >
                  <Plus aria-hidden="true" />
                </Button>
              )}
            </div>
            <ul
              id={`${listId}-${status}`}
              hidden={!!collapsed[status]}
              className="divide-y divide-border/50"
            >
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
                />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
