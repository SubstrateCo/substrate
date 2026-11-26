import { useId, useState, type ReactNode } from "react";

import { ProjectIcon } from "../projects/project-icon";
import type { ProjectDetail, Task, TaskDraft } from "../types";
import { TaskProperties } from "./task-properties";
import { TaskSubtasks } from "./task-subtasks";
import { CopyButton } from "@/components/feedback/copy-button";
import { useFocusAfterRender } from "@/components/feedback/use-focus-after-render";
import { PageSheetHeader, PageSheetBody } from "@/components/layout/page-sheet";
import { actionRow, RowActions } from "@/components/layout/row-actions";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Pressable } from "@/components/ui/pressable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProjectCapabilities } from "@/lib/tasks/project-capabilities";
import { hiddenTask } from "@/lib/tasks/task-status";
import { cn } from "cn";
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
  const editButtonId = useId();
  const focusAfterRender = useFocusAfterRender();
  const stopEditing = () => {
    setEditing(false);
    focusAfterRender(() => document.getElementById(editButtonId));
  };
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Pressable
                        className="min-w-0 truncate hover:text-foreground"
                        onClick={() => onSelectTask(parent.entityId)}
                      >
                        {parent.title}
                      </Pressable>
                    </TooltipTrigger>
                    <TooltipContent>{parent.title}</TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="truncate">{hiddenTask}</span>
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
                    id={editButtonId}
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
      <PageSheetBody>
        <div className="grid min-w-0 gap-6 wrap-anywhere">
          {editing && canEdit ? (
            renderEditor(stopEditing)
          ) : (
            <div className="grid gap-2">
              <Heading level={2} variant="record">
                {task.title}
              </Heading>
              {task.description && (
                <div className={cn(actionRow, "relative")}>
                  <MessageMarkdown body={task.description} />
                  <RowActions
                    label="Description actions"
                    className="absolute top-0 right-0 rounded-md bg-background"
                  >
                    {/* oxlint-disable-next-line design/icon-button-name -- CopyButton uses `label` as its aria-label. */}
                    <CopyButton
                      size="icon-sm"
                      grouped
                      label="Copy description"
                      onCopy={() => navigator.clipboard.writeText(task.description)}
                      successMessage="Description copied"
                      errorMessage="Couldn’t copy description"
                    />
                  </RowActions>
                </div>
              )}
              {!task.description && canEdit && (
                <Pressable
                  className="-mx-1 w-fit px-1 text-left text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setEditing(true)}
                >
                  Add a description
                </Pressable>
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
