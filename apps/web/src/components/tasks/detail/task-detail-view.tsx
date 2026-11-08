import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "../../ui/button";
import { ButtonGroup } from "../../ui/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import type { ProjectDetail, Task } from "../types";
import { TaskMetadata } from "./task-metadata";
import { X, Pencil, ListPlus, FolderKanban } from "lucide-react";

export function TaskDetail({
  detail,
  task,
  onClose,
  onSubtask,
  renderEditor,
  actions,
  children,
}: {
  detail: ProjectDetail;
  task: Task;
  onClose: () => void;
  onSubtask: () => void;
  renderEditor: (onDone: () => void) => ReactNode;
  actions?: ReactNode;
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
  const assignee = detail.actors.find((actor) => actor.entityId === task.assigneeActorEntityId);
  return (
    <section
      aria-label="Task details"
      className="min-w-0 space-y-5 rounded-xl border bg-card p-4 wrap-anywhere"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <FolderKanban aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate" title={detail.project.name}>
              {detail.project.name}
            </span>
          </p>
          <h2 className="text-lg font-semibold wrap-break-word">{task.title}</h2>
        </div>
        <ButtonGroup aria-label="Task actions" className="shrink-0">
          {canEdit && !editing && (
            <>
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
            </>
          )}
          {actions}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Close task" onClick={onClose}>
                <X aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close task</TooltipContent>
          </Tooltip>
        </ButtonGroup>
      </div>
      {editing && canEdit ? (
        <div ref={editor}>{renderEditor(() => setEditing(false))}</div>
      ) : (
        <TaskMetadata
          task={task}
          assigneeName={assignee?.name ?? "Unassigned"}
          assigneeType={assignee?.type}
        />
      )}
      {children}
    </section>
  );
}
