import type { TaskStatus } from "@startup-os/contracts/tasks";

import { TaskAssigneeHoverCard } from "../assignee/task-assignee-hover-card";
import { TaskBlockedCue } from "../list/task-list-item";
import { TaskStatusMenu } from "../list/task-status-menu";
import { TaskAssigneeAvatar } from "../task-cues/task-assignee-avatar";
import { taskPriorityLabels } from "../task-cues/task-labels";
import { TaskPriorityIcon } from "../task-cues/task-priority-icon";
import type { ProjectDetail, Task } from "../types";
import { DueDate } from "@/components/time/due-date";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "cn";
import { CornerDownRight, GripVertical } from "lucide-react";

export function TaskBoardCard({
  task,
  assignee,
  parentTitle,
  blocked = false,
  selected,
  onSelect,
  onStatusChange,
  statusPending,
}: {
  task: Task;
  assignee?: ProjectDetail["actors"][number];
  parentTitle?: string;
  blocked?: boolean;
  selected: boolean;
  onSelect: () => void;
  onStatusChange?: (status: TaskStatus) => void;
  statusPending: boolean;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: task.entityId,
    disabled: !onStatusChange || statusPending,
  });
  return (
    <li
      ref={setNodeRef}
      className={cn(
        "rounded-lg border bg-background p-3 shadow-surface",
        selected && "bg-row-selected text-row-selected-foreground ring-1 ring-ring/50",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-center gap-1">
        <TaskStatusMenu
          status={task.status}
          title={task.title}
          onChange={onStatusChange}
          disabled={statusPending}
        />
        <span className="flex-1" />
        {onStatusChange && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={setActivatorNodeRef}
                variant="ghost"
                size="icon-xs"
                disabled={statusPending}
                className="cursor-grab touch-none active:cursor-grabbing"
                {...attributes}
                {...listeners}
                aria-label={`Drag ${task.title}`}
              >
                <GripVertical aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Drag {task.title}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <button
        type="button"
        aria-label={`Open ${task.title}`}
        aria-current={selected || undefined}
        onClick={onSelect}
        className="mt-2 block w-full rounded-sm text-left text-sm font-medium wrap-break-word outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {task.title}
      </button>
      {task.parentTaskEntityId && (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <CornerDownRight aria-hidden="true" className="size-3 shrink-0" />
          <span className="sr-only">Subtask of </span>
          <span className="truncate">{parentTitle ?? "a task you can’t open"}</span>
        </p>
      )}
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center">
              <TaskPriorityIcon priority={task.priority} />
              <span className="sr-only">{taskPriorityLabels[task.priority]}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{taskPriorityLabels[task.priority]}</TooltipContent>
        </Tooltip>
        {task.dueDate && <DueDate value={task.dueDate} />}
        {blocked && <TaskBlockedCue />}
        <span className="flex-1" />
        {assignee ? (
          <TaskAssigneeHoverCard assignee={assignee}>
            <TaskAssigneeAvatar name={assignee.name} image={assignee.image} type={assignee.type} />
          </TaskAssigneeHoverCard>
        ) : (
          <span aria-label={task.assigneeActorEntityId ? "Former member" : "Unassigned"}>
            <TaskAssigneeAvatar name={task.assigneeActorEntityId ? "Former member" : undefined} />
          </span>
        )}
      </div>
    </li>
  );
}
