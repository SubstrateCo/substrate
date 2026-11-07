import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import type { ProjectDetail, Task } from "../types";
import { TaskMetadata } from "./task-metadata";
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
    <section
      aria-label="Task details"
      className="min-w-0 space-y-5 rounded-xl border bg-card p-4 wrap-anywhere"
    >
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    ref={editButton}
                    variant="outline"
                    size="icon"
                    aria-label="Edit task"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit task</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Add subtask"
                    onClick={onSubtask}
                  >
                    <ListPlus aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add subtask</TooltipContent>
              </Tooltip>
            </div>
          )}
        </>
      )}
      {children}
    </section>
  );
}
