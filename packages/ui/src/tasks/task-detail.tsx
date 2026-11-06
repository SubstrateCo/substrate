import { useState, type ReactNode } from "react";
import { Button } from "../primitives/button";
import type { ProjectDetail, Task } from "./types";

export function TaskDetail({
  detail,
  task,
  onClose,
  onSubtask,
  renderEditor,
  children,
}: {
  detail: ProjectDetail;
  task: Task;
  onClose: () => void;
  onSubtask: () => void;
  renderEditor: (onDone: () => void) => ReactNode;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const canEdit = detail.level === "edit" || detail.level === "owner";
  return (
    <section
      aria-label="Task details"
      className="min-w-0 space-y-5 rounded-xl border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 text-lg font-semibold wrap-break-word">{task.title}</h2>
        <Button variant="ghost" onClick={onClose}>
          Close task
        </Button>
      </div>
      {editing ? (
        renderEditor(() => setEditing(false))
      ) : (
        <>
          <p className="text-sm whitespace-pre-wrap wrap-break-word">
            {task.description || "No description."}
          </p>
          <dl className="grid grid-cols-2 gap-4 text-sm wrap-anywhere">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{detail.statuses.find((status) => status.id === task.statusId)?.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Priority</dt>
              <dd className="capitalize">{task.priority}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Assignee</dt>
              <dd>
                {detail.actors.find((actor) => actor.entityId === task.assigneeActorEntityId)
                  ?.name ?? "Unassigned"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Due date</dt>
              <dd>{task.dueDate ?? "No due date"}</dd>
            </div>
          </dl>
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edit task
              </Button>
              <Button variant="outline" onClick={onSubtask}>
                Add subtask
              </Button>
            </div>
          )}
        </>
      )}
      {children}
    </section>
  );
}
