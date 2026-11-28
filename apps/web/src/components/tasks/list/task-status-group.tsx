import { taskStatusLabels, type TaskStatus } from "@substrate/contracts/tasks";

import type { ReactNode } from "react";

import { TaskStatusIcon } from "../task-cues/task-status-icon";
import { TaskGroupHeaderLayout } from "./task-list-layout";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Pressable } from "@/components/ui/pressable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, Plus } from "lucide-react";

export function TaskStatusGroup({
  id,
  status,
  count,
  open,
  onToggle,
  onCreate,
  children,
}: {
  id: string;
  status: TaskStatus;
  count: number;
  open: boolean;
  onToggle: () => void;
  onCreate?: (status: TaskStatus) => void;
  children: ReactNode;
}) {
  const label = taskStatusLabels[status];
  return (
    <div role="group" aria-labelledby={`${id}-label`}>
      <TaskGroupHeaderLayout>
        <Heading level={2} variant="inherit" className="min-w-0 flex-1">
          <Pressable
            className="flex h-8 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium"
            aria-expanded={open}
            aria-controls={id}
            onClick={onToggle}
          >
            <ChevronRight
              aria-hidden="true"
              className={`size-3 text-muted-foreground transition-transform duration-150 ease-out group-focus-within/header:opacity-100 group-hover/header:opacity-100 [@media(hover:hover)]:opacity-0 ${open ? "rotate-90" : ""}`}
            />
            <TaskStatusIcon status={status} />
            <span id={`${id}-label`}>{label}</span>
            <span className="font-normal text-muted-foreground tabular-nums">{count}</span>
          </Pressable>
        </Heading>
        {onCreate && (
          <span className="transition-opacity duration-150 group-hover/header:opacity-100 has-focus-visible:opacity-100 [@media(hover:hover)]:opacity-0">
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
          </span>
        )}
      </TaskGroupHeaderLayout>
      <ul id={id} hidden={!open}>
        {children}
      </ul>
    </div>
  );
}
