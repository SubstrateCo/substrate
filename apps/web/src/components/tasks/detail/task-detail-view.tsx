import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { ProjectIcon } from "../projects/project-icon";
import type { ProjectDetail, Task, TaskDraft } from "../types";
import { TaskProperties } from "./task-properties";
import { TaskSubtasks } from "./task-subtasks";
import { PageSheetHeader, PageSheetBody } from "@/components/layout/page-sheet";
import type { ProjectCapabilities } from "@/lib/tasks/project-capabilities";
import { ChevronRight, Pencil } from "lucide-react";

/**
 * The task inspector: a fixed header with the task's place and tools, then one scrolling column
 * with the title, properties, description, subtasks, links, and the connected context in `children`.
 */
export function TaskDetail({
  detail,
  capabilities,
  task,
  onSelectTask,
  onSubtask,
  onUpdate,
  renderEditor,
  actions,
  links,
  children,
}: {
  detail: ProjectDetail;
  capabilities: ProjectCapabilities;
  task: Task;
  onSelectTask: (id: string) => void;
  onSubtask: () => void;
  onUpdate: (patch: Partial<TaskDraft>) => void;
  renderEditor: (onDone: () => void) => ReactNode;
  actions?: ReactNode;
  /** The linked tasks section. */
  links?: ReactNode;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (!editing && wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const { canEdit } = capabilities;
  const parent = task.parentTaskEntityId
    ? detail.tasks.find((candidate) => candidate.entityId === task.parentTaskEntityId)
    : undefined;
  const subtasks = detail.tasks.filter(
    (candidate) => candidate.parentTaskEntityId === task.entityId,
  );
  return (
    <section aria-label="Task details" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageSheetHeader
        title={
          <nav
            aria-label="Task location"
            className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground"
          >
            <ProjectIcon image={detail.project.image} className="size-3.5" />
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
                  <span className="truncate">A task you can’t open</span>
                )}
              </>
            )}
          </nav>
        }
        actions={
          <>
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
          </>
        }
      />
      <PageSheetBody className="p-0">
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
          <TaskProperties detail={detail} task={task} canEdit={canEdit} onChange={onUpdate} />
          <TaskSubtasks
            subtasks={subtasks}
            onSelect={onSelectTask}
            onCreate={canEdit ? onSubtask : undefined}
          />
          {links}
          {children}
        </div>
      </PageSheetBody>
    </section>
  );
}
