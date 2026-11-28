import { taskStatusLabels, type TaskStatus } from "@substrate/contracts/tasks";

import { TaskAssigneeAvatar } from "../assignee/task-assignee-avatar";
import { taskPriorityLabels } from "../task-cues/task-labels";
import { TaskPriorityIcon } from "../task-cues/task-priority-icon";
import type { ProjectDetail, Task } from "../types";
import {
  taskRowAssigneeClassName,
  taskRowClassName,
  taskRowContentClassName,
  taskRowDueDateClassName,
} from "./task-list-layout";
import { TaskStatusMenu } from "./task-status-menu";
import { rowStateVariants, rowTitleVariants } from "@/components/layout/row-state";
import { DueDate } from "@/components/time/due-date";
import { Pressable } from "@/components/ui/pressable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hiddenTaskInline, isClosedTask } from "@/lib/tasks/task-status";
import { cn } from "cn";
import { Ban, CornerDownRight } from "lucide-react";

export function TaskBlockedCue() {
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-destructive">
      <Ban aria-hidden="true" className="size-3" />
      <span className="sr-only">, </span>
      Blocked
    </span>
  );
}

export function TaskListItem({
  task,
  assignee,
  parentTitle,
  blocked = false,
  selected,
  onSelect,
  onStatusChange,
  statusPending = false,
}: {
  task: Task;
  assignee?: ProjectDetail["actors"][number];
  parentTitle?: string;
  blocked?: boolean;
  selected: boolean;
  onSelect: () => void;
  onStatusChange?: (status: TaskStatus) => void;
  statusPending?: boolean;
}) {
  return (
    <li
      data-selected={selected || undefined}
      className={cn(
        taskRowClassName,
        rowStateVariants({ selected }),
        !selected && "has-focus-visible:bg-row-hover",
      )}
    >
      <TaskStatusMenu
        status={task.status}
        title={task.title}
        onChange={onStatusChange}
        disabled={statusPending}
      />
      <Pressable
        focus="inset"
        aria-current={selected || undefined}
        onClick={onSelect}
        // oxlint-disable-next-line shadcn/require-static-classes -- A static layout string shared with the loading rows in project-loading.tsx, so the skeleton lines up with the row.
        className={cn(taskRowContentClassName, "text-left")}
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1 @md:flex-row @md:items-center @md:gap-2">
          <span className="sr-only">{taskStatusLabels[task.status]}: </span>
          <span
            className={cn(
              "line-clamp-2 wrap-anywhere @md:line-clamp-none @md:truncate",
              rowTitleVariants({ state: isClosedTask(task) ? "closed" : "read", selected }),
            )}
            title={task.title}
          >
            {task.title}
          </span>
          {blocked && <TaskBlockedCue />}
          {task.parentTaskEntityId && (
            <span className="hidden min-w-0 shrink items-center gap-1 text-xs text-muted-foreground @md:flex">
              <CornerDownRight aria-hidden="true" className="size-3 shrink-0" />
              <span className="sr-only">, subtask of </span>
              <span className="truncate">{parentTitle ?? hiddenTaskInline}</span>
            </span>
          )}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex size-5 shrink-0 items-center justify-center">
              <TaskPriorityIcon priority={task.priority} />
              <span className="sr-only">, {taskPriorityLabels[task.priority]}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{taskPriorityLabels[task.priority]}</TooltipContent>
        </Tooltip>
        <span className={taskRowDueDateClassName}>
          {task.dueDate && (
            <>
              <span className="sr-only">, due </span>
              <DueDate value={task.dueDate} />
            </>
          )}
        </span>
      </Pressable>
      <span className={taskRowAssigneeClassName}>
        <TaskAssigneeAvatar assignee={assignee} assigned={Boolean(task.assigneeActorEntityId)} />
      </span>
    </li>
  );
}
