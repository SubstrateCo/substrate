import { taskStatusLabels, type TaskStatus } from "@substrate/contracts/tasks";

import { taskStatusOptions } from "../task-cues/task-options";
import { TaskStatusIcon } from "../task-cues/task-status-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The status icon of a task row. For editors it opens a menu that changes the status. */
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
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Change status of ${title}: ${taskStatusLabels[status]}`}
          className="flex size-6 shrink-0 items-center justify-center rounded-md outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-foreground/10"
        >
          <TaskStatusIcon status={status} />
        </button>
      </DropdownMenuTrigger>
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
