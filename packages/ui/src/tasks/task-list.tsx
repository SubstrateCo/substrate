import { taskStatusLabels, taskStatusValues } from "@startup-os/contracts/tasks";
import type { ProjectDetail } from "./types";
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
    <section aria-label="Project tasks" className="min-w-0 space-y-5">
      {!detail.tasks.length && (
        <div className="rounded-xl border border-dashed p-6">
          <h2 className="font-semibold">No tasks yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.level === "edit" || detail.level === "owner"
              ? "Create the first task for this project."
              : "Tasks will appear here when a project editor creates them."}
          </p>
        </div>
      )}
      {taskStatusValues.map((status) => {
        const rows = detail.tasks.filter((task) => task.status === status);
        if (!rows.length) return null;
        return (
          <div key={status}>
            <h2 className="mb-2 text-sm font-semibold wrap-anywhere">
              {taskStatusLabels[status]}{" "}
              <span className="text-muted-foreground">{rows.length}</span>
            </h2>
            <ul className="space-y-1">
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
