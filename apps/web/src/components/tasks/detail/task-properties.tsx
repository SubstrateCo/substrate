import { taskStatusLabels } from "@startup-os/contracts/tasks";

import type { ReactNode } from "react";

import { assignableActors } from "../assignee/assignable";
import { assigneeLabel, AssigneePicker } from "../assignee/assignee-picker";
import { TaskAssigneeAvatar } from "../task-cues/task-assignee-avatar";
import { taskPriorityLabels } from "../task-cues/task-labels";
import { taskPriorityOptions, taskStatusOptions } from "../task-cues/task-options";
import { TaskPriorityIcon } from "../task-cues/task-priority-icon";
import { TaskStatusIcon } from "../task-cues/task-status-icon";
import type { ProjectDetail, Task, TaskDraft } from "../types";
import { TaskDueDatePicker } from "./task-due-date-picker";
import { Tag } from "@/components/feedback/tag";
import { DueDate } from "@/components/time/due-date";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDueDate } from "@/lib/format/date";
import { CalendarDays, ChevronDown } from "lucide-react";

// Property values look like text until hovered, then act as menu buttons. The negative margin
// lines their text up with plain values.
const trigger = "-ml-2.5 max-w-full min-w-0";

function dueText(value: string | null) {
  const due = value ? formatDueDate(value) : undefined;
  if (!due) return "none";
  return due.state === "overdue" ? `${due.label}, overdue` : due.label;
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      <dt className="w-24 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center text-sm">{children}</dd>
    </div>
  );
}

function PropertySelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option && option.value !== value) onChange(option.value);
      }}
    >
      <SelectTrigger variant="ghost" size="sm" aria-label={label} className={trigger}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="min-w-44">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.icon}
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Status, priority, assignee, and due date. Editors change each one in place. */
export function TaskProperties({
  detail,
  task,
  canEdit,
  onChange,
}: {
  detail: ProjectDetail;
  task: Task;
  canEdit: boolean;
  onChange: (patch: Partial<TaskDraft>) => void;
}) {
  const assignee = detail.actors.find((actor) => actor.entityId === task.assigneeActorEntityId);
  const assigneeText = assigneeLabel(task.assigneeActorEntityId, detail.actors);
  const assigneeValue = (
    <>
      <TaskAssigneeAvatar name={assignee?.name} type={assignee?.type} />
      <span className={`truncate ${assignee ? "" : "text-muted-foreground"}`}>{assigneeText}</span>
      {assignee?.type === "agent" && <Tag className="py-0">Agent</Tag>}
    </>
  );
  const dueValue = task.dueDate ? (
    <DueDate value={task.dueDate} />
  ) : (
    <span className="text-muted-foreground">No due date</span>
  );
  return (
    <dl className="grid">
      <Property label="Status">
        {canEdit ? (
          <PropertySelect
            label="Status"
            value={task.status}
            options={taskStatusOptions}
            onChange={(status) => onChange({ status })}
          />
        ) : (
          <span className="flex items-center gap-2">
            <TaskStatusIcon status={task.status} />
            {taskStatusLabels[task.status]}
          </span>
        )}
      </Property>
      <Property label="Priority">
        {canEdit ? (
          <PropertySelect
            label="Priority"
            value={task.priority}
            options={taskPriorityOptions}
            onChange={(priority) => onChange({ priority })}
          />
        ) : (
          <span className="flex items-center gap-2">
            <TaskPriorityIcon priority={task.priority} />
            {taskPriorityLabels[task.priority]}
          </span>
        )}
      </Property>
      <Property label="Assignee">
        {canEdit ? (
          <AssigneePicker
            value={task.assigneeActorEntityId}
            assignees={assignableActors(detail, task.assigneeActorEntityId)}
            onChange={(assigneeActorEntityId) => onChange({ assigneeActorEntityId })}
          >
            {() => (
              <Button
                type="button"
                variant="property"
                size="sm"
                role="combobox"
                aria-label={`Assignee: ${assigneeText}`}
                className={`${trigger} group/property`}
              >
                <span className="flex min-w-0 items-center gap-2">{assigneeValue}</span>
                <ChevronDown
                  aria-hidden="true"
                  className="text-muted-foreground opacity-0 group-hover/property:opacity-100 group-focus-visible/property:opacity-100"
                />
              </Button>
            )}
          </AssigneePicker>
        ) : (
          <span className="flex min-w-0 items-center gap-2">{assigneeValue}</span>
        )}
      </Property>
      <Property label="Due date">
        {canEdit ? (
          <TaskDueDatePicker value={task.dueDate} onChange={(dueDate) => onChange({ dueDate })}>
            <Button
              type="button"
              variant="property"
              size="sm"
              aria-label={`Due date: ${dueText(task.dueDate)}`}
              className={`${trigger} group/property`}
            >
              <span className="flex items-center gap-2">
                <CalendarDays aria-hidden="true" className="text-muted-foreground" />
                {dueValue}
              </span>
              <ChevronDown
                aria-hidden="true"
                className="text-muted-foreground opacity-0 group-hover/property:opacity-100 group-focus-visible/property:opacity-100"
              />
            </Button>
          </TaskDueDatePicker>
        ) : (
          <span className="flex items-center gap-2">
            <CalendarDays aria-hidden="true" className="size-4 text-muted-foreground" />
            {dueValue}
          </span>
        )}
      </Property>
    </dl>
  );
}
