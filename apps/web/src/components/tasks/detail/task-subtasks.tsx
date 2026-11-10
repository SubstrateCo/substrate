import { taskStatusLabels } from "@startup-os/contracts/tasks";

import { TaskStatusIcon } from "../task-cues/task-status-icon";
import type { Task } from "../types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus } from "lucide-react";

/** A task's subtasks as compact rows. Editors add one from the section header. */
export function TaskSubtasks({
  subtasks,
  onSelect,
  onCreate,
}: {
  subtasks: Task[];
  onSelect: (id: string) => void;
  onCreate?: () => void;
}) {
  const done = subtasks.filter((task) => task.status === "completed").length;
  return (
    <section aria-label="Subtasks" className="space-y-1">
      <div className="flex h-7 items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          Subtasks
          {!!subtasks.length && (
            <span className="font-normal tabular-nums">
              {done}/{subtasks.length}
            </span>
          )}
        </h3>
        {onCreate && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Add subtask"
                onClick={onCreate}
              >
                <Plus aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add subtask</TooltipContent>
          </Tooltip>
        )}
      </div>
      {!subtasks.length && <p className="text-sm text-muted-foreground">No subtasks</p>}
      {!!subtasks.length && (
        <ul className="-mx-2 grid gap-px">
          {subtasks.map((task) => (
            <li key={task.entityId}>
              <button
                type="button"
                className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring/50"
                onClick={() => onSelect(task.entityId)}
              >
                <span className="sr-only">{taskStatusLabels[task.status]}: </span>
                <TaskStatusIcon status={task.status} />
                <span
                  className={`truncate ${task.status === "completed" || task.status === "canceled" ? "text-muted-foreground" : ""}`}
                >
                  {task.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
