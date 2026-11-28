import { taskStatusLabels, type TaskStatus } from "@substrate/contracts/tasks";

import { taskStatusOptions } from "../task-cues/task-options";
import { TaskStatusIcon } from "../task-cues/task-status-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function TaskStatusMenu({
  status,
  title,
  onChange,
  disabled = false,
}: {
  status: TaskStatus;
  title: string;
  onChange?: (status: TaskStatus) => void;
  disabled?: boolean;
}) {
  if (!onChange)
    return (
      <span className="flex size-6 shrink-0 items-center justify-center">
        <TaskStatusIcon status={status} />
      </span>
    );
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              disabled={disabled}
              aria-label={`Change status of ${title}: ${taskStatusLabels[status]}`}
            >
              <TaskStatusIcon status={status} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Change status</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={status}
          onValueChange={(next) => {
            const option = taskStatusOptions.find((candidate) => candidate.value === next);
            if (option && option.value !== status && !disabled) onChange(option.value);
          }}
        >
          {taskStatusOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.icon}
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
