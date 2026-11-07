import { taskStatusLabels } from "@startup-os/contracts/tasks";

import { Button } from "../../ui/button";
import { TaskPriorityIcon } from "../task-cues/task-priority-icon";
import { TaskStatusIcon } from "../task-cues/task-status-icon";
import type { ProjectDetail, Task } from "../types";
import { CornerDownRight, UserRound } from "lucide-react";

export function TaskListItem({
  detail,
  task,
  selected,
  onSelect,
}: {
  detail: ProjectDetail;
  task: Task;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <Button
        variant="ghost"
        size="selection"
        className="relative w-full justify-start text-left whitespace-normal"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="flex w-full min-w-0 items-center gap-3">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="sr-only">{taskStatusLabels[task.status]}: </span>
            <TaskStatusIcon status={task.status} />
            <span className="min-w-0">
              <span className="block truncate font-medium" title={task.title}>
                {task.title}
              </span>
              {task.parentTaskEntityId && (
                <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <CornerDownRight aria-hidden="true" className="size-3 shrink-0" />
                  Subtask of{" "}
                  {detail.tasks.find((parent) => parent.entityId === task.parentTaskEntityId)
                    ?.title ?? "archived task"}
                </span>
              )}
            </span>
          </span>
          <span className="flex w-20 shrink-0 items-center gap-1.5 text-xs whitespace-nowrap capitalize @xl:w-24">
            <TaskPriorityIcon priority={task.priority} />
            <span>
              {task.priority === "none" ? "No priority" : task.priority}
              <span className="sr-only"> priority</span>
            </span>
          </span>
          <span className="hidden w-32 min-w-0 shrink-0 items-center gap-1.5 text-xs text-muted-foreground @xl:flex">
            <UserRound aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">
              {task.assigneeActorEntityId
                ? (detail.actors.find((actor) => actor.entityId === task.assigneeActorEntityId)
                    ?.name ?? "Former member")
                : "Unassigned"}
            </span>
          </span>
          <span className="hidden w-24 shrink-0 text-xs text-muted-foreground tabular-nums @xl:block">
            {task.dueDate ? <time dateTime={task.dueDate}>{task.dueDate}</time> : "No due date"}
          </span>
        </span>
      </Button>
    </li>
  );
}
