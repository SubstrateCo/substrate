import { taskStatusLabels, taskStatusValues } from "@startup-os/contracts/tasks";

import { useId } from "react";

import { TaskSelect } from "../task-select";
import type { ProjectDetail, Task } from "../types";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";

const priorities: Task["priority"][] = ["none", "low", "medium", "high", "urgent"];

export interface TaskScheduleDraft {
  status: Task["status"];
  priority: Task["priority"];
  assignee: string;
  dueDate: string;
}

export function TaskScheduleFields({
  value,
  onChange,
  assignees,
}: {
  value: TaskScheduleDraft;
  onChange: (change: Partial<TaskScheduleDraft>) => void;
  assignees: ProjectDetail["actors"];
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-4 @sm:grid-cols-2">
      <TaskSelect
        label="Status"
        value={value.status}
        onChange={(status) => onChange({ status })}
        options={taskStatusValues.map((value) => ({
          value,
          label: taskStatusLabels[value],
        }))}
      />
      <TaskSelect
        label="Priority"
        value={value.priority}
        onChange={(priority) => onChange({ priority })}
        options={priorities.map((value) => ({
          value,
          label: value[0]!.toUpperCase() + value.slice(1),
        }))}
      />
      <TaskSelect
        label="Assignee"
        value={value.assignee}
        onChange={(assignee) => onChange({ assignee })}
        options={[
          { value: "unassigned", label: "Unassigned" },
          ...assignees.map((actor) => ({
            value: actor.entityId,
            label: `${actor.name}${actor.type === "agent" ? " (agent)" : ""}`,
          })),
          ...(value.assignee !== "unassigned" &&
          !assignees.some((actor) => actor.entityId === value.assignee)
            ? [
                {
                  value: value.assignee,
                  label: "Former project member — select a new assignee",
                },
              ]
            : []),
        ]}
      />
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${id}-due`}>Due date</Label>
        <Input
          id={`${id}-due`}
          type="date"
          value={value.dueDate}
          onChange={(event) => onChange({ dueDate: event.target.value })}
        />
      </div>
    </div>
  );
}
