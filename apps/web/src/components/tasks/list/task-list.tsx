import { taskStatusLabels, taskStatusValues } from "@startup-os/contracts/tasks";

import { ContentNotice } from "../../feedback/content-notice";
import { TaskStatusIcon } from "../task-cues/task-status-icon";
import type { ProjectDetail } from "../types";
import { TaskListItem } from "./task-list-item";

export function TaskList({
  detail,
  selectedId,
  onSelect,
}: {
  detail: ProjectDetail;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
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
          <div key={status}>
            <h2 className="mb-1 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold wrap-anywhere">
              <TaskStatusIcon status={status} />
              {taskStatusLabels[status]}{" "}
              <span className="rounded bg-muted px-1.5 py-0.5 font-normal text-muted-foreground tabular-nums">
                {rows.length}
              </span>
            </h2>
            <ul className="divide-y divide-border/50">
              {rows.map((task) => (
                <TaskListItem
                  key={task.entityId}
                  detail={detail}
                  task={task}
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
