import { taskStatusLabels, type TaskStatus } from "@substrate/contracts/tasks";

import { useId, type ReactNode } from "react";

import { TaskStatusIcon } from "../task-cues/task-status-icon";
import { ContentNotice } from "@/components/feedback/content-notice";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "cn";
import { Plus } from "lucide-react";

export function TaskBoardColumn({
  status,
  count,
  onCreate,
  disabled,
  children,
}: {
  status: TaskStatus;
  count: number;
  onCreate?: (status: TaskStatus) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  const labelId = useId();
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled });
  const label = taskStatusLabels[status];
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={labelId}
      className={cn(
        "flex min-h-0 w-56 min-w-56 flex-1 flex-col rounded-lg border bg-inset",
        isOver && "border-ring bg-row-highlight ring-2 ring-ring/50",
      )}
    >
      <header className="flex shrink-0 items-center gap-2 p-3">
        <TaskStatusIcon status={status} />
        <h2 id={labelId} className="flex-1 text-sm font-semibold">
          {label}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
        {onCreate && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Add task to ${label}`}
                onClick={() => onCreate(status)}
              >
                <Plus aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add task to {label}</TooltipContent>
          </Tooltip>
        )}
      </header>
      <ul
        aria-label={`${label} tasks`}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3"
      >
        {children}
        {!count && (
          <li>
            <ContentNotice variant="inline" title="No tasks" />
          </li>
        )}
      </ul>
    </section>
  );
}
