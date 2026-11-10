import { useEffect, useRef, useState, type ReactNode } from "react";

import { FormMessage } from "../../auth/form-message";
import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import type { ProjectDetail, Task, TaskDraft } from "../types";
import { TaskProperties } from "./task-properties";
import { TaskSubtasks } from "./task-subtasks";
import { ChevronRight, FolderKanban, Pencil, X } from "lucide-react";

/**
 * The task inspector: a fixed header with the task's place and tools, then one scrolling column
 * with the title, properties, description, subtasks, and the connected context in `children`.
 */
export function TaskDetail({
  detail,
  task,
  onClose,
  onSelectTask,
  onSubtask,
  onUpdate,
  updateError,
  renderEditor,
  actions,
  children,
}: {
  detail: ProjectDetail;
  task: Task;
  onClose: () => void;
  onSelectTask: (id: string) => void;
  onSubtask: () => void;
  onUpdate: (patch: Partial<TaskDraft>) => void;
  updateError?: Error | null;
  renderEditor: (onDone: () => void) => ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (!editing && wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const canEdit = detail.level === "edit" || detail.level === "owner";
  const parent = task.parentTaskEntityId
    ? detail.tasks.find((candidate) => candidate.entityId === task.parentTaskEntityId)
    : undefined;
  const subtasks = detail.tasks.filter(
    (candidate) => candidate.parentTaskEntityId === task.entityId,
  );
  return (
    <section aria-label="Task details" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <nav
          aria-label="Task location"
          className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground"
        >
          <FolderKanban aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate" title={detail.project.name}>
            {detail.project.name}
          </span>
          {task.parentTaskEntityId && (
            <>
              <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
              {parent ? (
                <button
                  type="button"
                  className="min-w-0 truncate rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  title={parent.title}
                  onClick={() => onSelectTask(parent.entityId)}
                >
                  {parent.title}
                </button>
              ) : (
                <span className="truncate">A task you can't open</span>
              )}
            </>
          )}
        </nav>
        <div role="group" aria-label="Task actions" className="flex shrink-0 items-center gap-0.5">
          {canEdit && !editing && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={editButton}
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit task"
                  onClick={() => setEditing(true)}
                >
                  <Pencil aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit title and description</TooltipContent>
            </Tooltip>
          )}
          {actions}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close task" onClick={onClose}>
                <X aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close task</TooltipContent>
          </Tooltip>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid min-w-0 gap-5 px-5 pt-4 pb-8 wrap-anywhere">
          {editing && canEdit ? (
            renderEditor(() => setEditing(false))
          ) : (
            <div className="grid gap-2">
              <h2 className="text-lg/snug font-semibold wrap-break-word">{task.title}</h2>
              {task.description && (
                <p className="text-sm/relaxed wrap-break-word whitespace-pre-wrap">
                  {task.description}
                </p>
              )}
              {!task.description && canEdit && (
                <button
                  type="button"
                  className="-mx-1 w-fit rounded-sm px-1 text-left text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => setEditing(true)}
                >
                  Add a description…
                </button>
              )}
            </div>
          )}
          <div className="grid gap-2">
            <TaskProperties detail={detail} task={task} canEdit={canEdit} onChange={onUpdate} />
            <FormMessage
              error={updateError}
              errorDescription="Couldn't update this task. Your change was undone."
            />
          </div>
          <TaskSubtasks
            subtasks={subtasks}
            onSelect={onSelectTask}
            onCreate={canEdit ? onSubtask : undefined}
          />
          {children}
        </div>
      </div>
    </section>
  );
}
