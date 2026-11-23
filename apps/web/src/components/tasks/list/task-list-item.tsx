import { taskStatusLabels, type TaskStatus } from "@substrate/contracts/tasks";

import { TaskAssigneeHoverCard } from "../assignee/task-assignee-hover-card";
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
import { PersonAvatar } from "@/components/people/person-avatar";
import { DueDate } from "@/components/time/due-date";
import { Pressable } from "@/components/ui/pressable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";
import { Ban, CornerDownRight } from "lucide-react";

/** Marks a task that waits on another open task. */
export function TaskBlockedCue() {
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-destructive">
      <Ban aria-hidden="true" className="size-3" />
      <span className="sr-only">, </span>
      Blocked
    </span>
  );
}

/**
 * One task row: status (a menu for editors), title, parent, then priority, due date, and
 * assignee in fixed columns so they line up down the list.
 */
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
  /** An open task blocks this one. */
  blocked?: boolean;
  selected: boolean;
  onSelect: () => void;
  onStatusChange?: (status: TaskStatus) => void;
  statusPending?: boolean;
}) {
  const closed = task.status === "completed" || task.status === "canceled";
  return (
    <li
      data-selected={selected || undefined}
      className={cn(
        taskRowClassName,
        selected
          ? "bg-row-selected text-row-selected-foreground"
          : "hover:bg-row-hover has-focus-visible:bg-row-hover",
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
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="sr-only">{taskStatusLabels[task.status]}: </span>
          <span
            className={cn(
              "truncate",
              selected && "font-medium",
              closed && !selected && "text-muted-foreground",
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
              <span className="truncate">{parentTitle ?? "a task you can’t open"}</span>
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
      <TaskListAssignee assignee={assignee} assigned={Boolean(task.assigneeActorEntityId)} />
    </li>
  );
}

function TaskListAssignee({
  assignee,
  assigned,
}: {
  assignee?: ProjectDetail["actors"][number];
  assigned: boolean;
}) {
  const missingName = assigned ? "Former member" : undefined;
  return (
    <span className={taskRowAssigneeClassName}>
      {assignee ? (
        <TaskAssigneeHoverCard assignee={assignee}>
          <PersonAvatar
            size="xs"
            name={assignee.name}
            image={assignee.image}
            agent={assignee.type === "agent"}
          />
        </TaskAssigneeHoverCard>
      ) : (
        <span aria-label={missingName ?? "Unassigned"}>
          <PersonAvatar size="xs" name={missingName} />
        </span>
      )}
    </span>
  );
}
