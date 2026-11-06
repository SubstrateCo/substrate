import { taskStatusLabels } from "@startup-os/contracts/tasks";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "../primitives/button";
import { TaskPriorityIcon, TaskStatusIcon } from "./task-cues";
import type { ProjectDetail, Task } from "./types";
import { X, Pencil, ListPlus } from "lucide-react";

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
  const editor = useRef<HTMLDivElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editing) editor.current?.querySelector<HTMLInputElement>("input")?.focus();
    else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const canEdit = detail.level === "edit" || detail.level === "owner";
  return (
    <section aria-label="Task details" className="min-w-0 space-y-5 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold wrap-break-word">{task.title}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close task" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>
      {editing && canEdit ? (
        <div ref={editor}>{renderEditor(() => setEditing(false))}</div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-muted/40 p-3 text-sm wrap-anywhere [&_dt]:mb-1 [&_dt]:text-xs">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="flex items-center gap-1.5">
                <TaskStatusIcon status={task.status} />
                {taskStatusLabels[task.status]}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Priority</dt>
              <dd className="flex items-center gap-1.5 capitalize">
                <TaskPriorityIcon priority={task.priority} />
                {task.priority}
              </dd>
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
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">Description</h3>
            <p className="text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
              {task.description || "No description."}
            </p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button ref={editButton} variant="outline" onClick={() => setEditing(true)}>
                <Pencil aria-hidden="true" /> Edit task
              </Button>
              <Button variant="outline" onClick={onSubtask}>
                <ListPlus aria-hidden="true" /> Add subtask
              </Button>
            </div>
          )}
        </>
      )}
      {children}
    </section>
  );
}
