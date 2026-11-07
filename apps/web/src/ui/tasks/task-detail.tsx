import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "../primitives/button";
import { TaskMetadata } from "./task-detail/task-metadata";
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
          <TaskMetadata
            task={task}
            assigneeName={
              detail.actors.find((actor) => actor.entityId === task.assigneeActorEntityId)?.name ??
              "Unassigned"
            }
          />
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
