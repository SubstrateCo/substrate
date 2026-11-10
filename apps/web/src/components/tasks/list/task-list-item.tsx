import { taskStatusLabels, type TaskStatus } from "@startup-os/contracts/tasks";

import { TaskAssigneeHoverCard } from "../assignee/task-assignee-hover-card";
import { TaskAssigneeAvatar } from "../task-cues/task-assignee-avatar";
import { taskPriorityLabels } from "../task-cues/task-labels";
import { TaskPriorityIcon } from "../task-cues/task-priority-icon";
import type { ProjectDetail, Task } from "../types";
import { TaskStatusMenu } from "./task-status-menu";
import { DueDate } from "@/components/time/due-date";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";
import { CornerDownRight } from "lucide-react";

/**
 * One task row: status (a menu for editors), title, parent, then priority, due date, and
 * assignee in fixed columns so they line up down the list.
 */
export function TaskListItem({
  task,
  assignee,
  parentTitle,
  selected,
  onSelect,
  onStatusChange,
}: {
  task: Task;
  assignee?: ProjectDetail["actors"][number];
  parentTitle?: string;
  selected: boolean;
  onSelect: () => void;
  onStatusChange?: (status: TaskStatus) => void;
}) {
  const closed = task.status === "completed" || task.status === "canceled";
  const assigneeName = task.assigneeActorEntityId ? (assignee?.name ?? "Former member") : undefined;
  return (
    <li
      data-selected={selected || undefined}
      className={cn(
        "flex h-11 items-center gap-1 pr-6 pl-9 text-sm",
        selected
          ? "bg-row-selected text-row-selected-foreground"
          : "hover:bg-row-hover has-focus-visible:bg-row-hover",
      )}
    >
      <TaskStatusMenu status={task.status} title={task.title} onChange={onStatusChange} />
      <button
        type="button"
        aria-current={selected || undefined}
        onClick={onSelect}
        className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-sm pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
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
        <span className="hidden w-16 shrink-0 justify-end text-xs text-muted-foreground @sm:flex">
          {task.dueDate && (
            <>
              <span className="sr-only">, due </span>
              <DueDate value={task.dueDate} />
            </>
          )}
        </span>
      </button>
      <span className="ml-2 flex w-6 shrink-0 justify-center">
        {assignee ? (
          <TaskAssigneeHoverCard assignee={assignee}>
            <TaskAssigneeAvatar name={assignee.name} type={assignee.type} />
          </TaskAssigneeHoverCard>
        ) : (
          <span aria-label={assigneeName ?? "Unassigned"}>
            <TaskAssigneeAvatar name={assigneeName} />
          </span>
        )}
      </span>
    </li>
  );
}
