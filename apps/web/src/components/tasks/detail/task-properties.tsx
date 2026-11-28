import { taskStatusLabels } from "@substrate/contracts/tasks";
import { assignableActors } from "@substrate/contracts/tasks/project-access";

import type { ReactNode } from "react";

import { assigneeLabel } from "../assignee/assignee-label";
import { AssigneePicker } from "../assignee/assignee-picker";
import { taskPriorityLabels } from "../task-cues/task-labels";
import { taskPriorityOptions, taskStatusOptions } from "../task-cues/task-options";
import { TaskPriorityIcon } from "../task-cues/task-priority-icon";
import { TaskStatusIcon } from "../task-cues/task-status-icon";
import type { ProjectDetail, Task, TaskDraft } from "../types";
import { TaskDueDatePicker } from "./task-due-date-picker";
import { NotSet, Property, PropertyList } from "@/components/layout/record-section";
import { ActorAvatar, ActorKindSuffix } from "@/components/people/actor-avatar";
import { DueDate } from "@/components/time/due-date";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actorIdentity, actorLabel } from "@/lib/actors/identity";
import { formatDueDate } from "@/lib/format/date";
import { CalendarDays, ChevronDown } from "lucide-react";

const trigger = "-ml-2.5 max-w-full min-w-0";

function dueText(value: string | null) {
  const due = value ? formatDueDate(value) : undefined;
  if (!due) return "Not set";
  return due.state === "overdue" ? `${due.label}, overdue` : due.label;
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

export function TaskProperties({
  detail,
  task,
  canEdit,
  onChange,
  assignToMeAction,
}: {
  detail: ProjectDetail;
  task: Task;
  canEdit: boolean;
  onChange: (patch: Partial<TaskDraft>) => void;
  assignToMeAction?: ReactNode;
}) {
  if (canEdit)
    return (
      <EditableTaskProperties
        detail={detail}
        task={task}
        onChange={onChange}
        assignToMeAction={assignToMeAction}
      />
    );
  return <ReadOnlyTaskProperties detail={detail} task={task} />;
}

function taskAssignee(detail: ProjectDetail, task: Task) {
  const assigned = detail.actors.find((actor) => actor.entityId === task.assigneeActorEntityId);
  return {
    actor: assigned && actorIdentity(assigned),
    text: assigneeLabel(task.assigneeActorEntityId, detail.actors),
  };
}

function AssigneeValue({ assignee }: { assignee: ReturnType<typeof taskAssignee> }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ActorAvatar actor={assignee.actor} size="xs" />
      <span className={`truncate ${assignee.actor ? "" : "text-muted-foreground"}`}>
        {assignee.text}
      </span>
      <ActorKindSuffix actor={assignee.actor} />
    </span>
  );
}

function DueValue({ value }: { value: string | null }) {
  return (
    <span className="flex items-center gap-2">
      <CalendarDays aria-hidden="true" className="size-3.5 text-muted-foreground" />
      {value ? <DueDate value={value} /> : <NotSet />}
    </span>
  );
}

function EditableTaskProperties({
  detail,
  task,
  onChange,
  assignToMeAction,
}: {
  detail: ProjectDetail;
  task: Task;
  onChange: (patch: Partial<TaskDraft>) => void;
  assignToMeAction?: ReactNode;
}) {
  const assignee = taskAssignee(detail, task);
  return (
    <PropertyList>
      <Property label="Status">
        <PropertySelect
          label="Status"
          value={task.status}
          options={taskStatusOptions}
          onChange={(status) => onChange({ status })}
        />
      </Property>
      <Property label="Priority">
        <PropertySelect
          label="Priority"
          value={task.priority}
          options={taskPriorityOptions}
          onChange={(priority) => onChange({ priority })}
        />
      </Property>
      <Property label="Assignee">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <AssigneePicker
            value={task.assigneeActorEntityId}
            assignees={assignableActors(detail, task.assigneeActorEntityId)}
            onChange={(assigneeActorEntityId) => onChange({ assigneeActorEntityId })}
            trigger={
              <Button
                type="button"
                variant="property"
                size="sm"
                role="combobox"
                aria-label={actorLabel(assignee.actor, `Assignee: ${assignee.text}`)}
                className={trigger}
              />
            }
          >
            <AssigneeValue assignee={assignee} />
          </AssigneePicker>
          {assignToMeAction}
        </div>
      </Property>
      <Property label="Due date">
        <TaskDueDatePicker value={task.dueDate} onChange={(dueDate) => onChange({ dueDate })}>
          <Button
            type="button"
            variant="property"
            size="sm"
            aria-label={`Due date: ${dueText(task.dueDate)}`}
            className={`${trigger} group/property`}
          >
            <DueValue value={task.dueDate} />
            <ChevronDown
              aria-hidden="true"
              className="text-muted-foreground opacity-0 group-hover/property:opacity-100 group-focus-visible/property:opacity-100"
            />
          </Button>
        </TaskDueDatePicker>
      </Property>
    </PropertyList>
  );
}

function ReadOnlyTaskProperties({ detail, task }: { detail: ProjectDetail; task: Task }) {
  return (
    <PropertyList>
      <Property label="Status">
        <span className="flex items-center gap-2">
          <TaskStatusIcon status={task.status} />
          {taskStatusLabels[task.status]}
        </span>
      </Property>
      <Property label="Priority">
        <span className="flex items-center gap-2">
          <TaskPriorityIcon priority={task.priority} />
          {taskPriorityLabels[task.priority]}
        </span>
      </Property>
      <Property label="Assignee">
        <AssigneeValue assignee={taskAssignee(detail, task)} />
      </Property>
      <Property label="Due date">
        <DueValue value={task.dueDate} />
      </Property>
    </PropertyList>
  );
}
