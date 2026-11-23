import type { TaskStatus } from "@substrate/contracts/tasks";

import { TaskAssigneeHoverCard } from "../assignee/task-assignee-hover-card";
import { TaskBlockedCue } from "../list/task-list-item";
import { TaskStatusMenu } from "../list/task-status-menu";
import { taskPriorityLabels } from "../task-cues/task-labels";
import { TaskPriorityIcon } from "../task-cues/task-priority-icon";
import type { ProjectDetail, Task } from "../types";
import { BoardCard, boardCardTarget } from "@/components/layout/board";
import { actionRow, RowActions } from "@/components/layout/row-actions";
import { PersonAvatar } from "@/components/people/person-avatar";
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
    <BoardCard
      ref={setNodeRef}
      selected={selected}
      className={cn(actionRow, isDragging && "opacity-40")}
    >
      <div className={cn("flex items-start gap-2", onStatusChange && "pr-6")}>
        {/* Controls sit above the card's stretched title button. */}
        <span className="relative z-10">
          <TaskStatusMenu
            status={task.status}
            title={task.title}
            onChange={onStatusChange}
            disabled={statusPending}
          />
        </span>
        <button
          type="button"
          aria-label={`Open ${task.title}`}
          aria-current={selected || undefined}
          onClick={onSelect}
          className={cn(boardCardTarget, "min-w-0 flex-1 py-0.5 text-left")}
        >
          {task.title}
        </button>
      </div>
      {onStatusChange && (
        <RowActions label={`Actions for ${task.title}`} className="absolute top-2 right-2 z-10">
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
        </RowActions>
      )}
      {task.parentTaskEntityId && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <CornerDownRight aria-hidden="true" className="size-3 shrink-0" />
          <span className="sr-only">Subtask of </span>
          <span className="truncate">{parentTitle ?? "a task you can’t open"}</span>
        </p>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="relative z-10 flex items-center">
              <TaskPriorityIcon priority={task.priority} />
              <span className="sr-only">{taskPriorityLabels[task.priority]}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{taskPriorityLabels[task.priority]}</TooltipContent>
        </Tooltip>
        {task.dueDate && <DueDate value={task.dueDate} />}
        {blocked && <TaskBlockedCue />}
        <span className="flex-1" />
        <span className="relative z-10 flex">
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
            <span aria-label={task.assigneeActorEntityId ? "Former member" : "Unassigned"}>
              <PersonAvatar
                size="xs"
                name={task.assigneeActorEntityId ? "Former member" : undefined}
              />
            </span>
          )}
        </span>
      </div>
    </BoardCard>
  );
}
