import { taskStatusLabels, taskStatusValues } from "@startup-os/contracts/tasks";

import { useId } from "react";

import { TaskSelect } from "../task-select";
import type { ProjectDetail, Task } from "../types";
import type { TaskEditorForm } from "./task-form-view";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const priorities: Task["priority"][] = ["none", "low", "medium", "high", "urgent"];

export function TaskScheduleFields({
  form,
  assignees,
}: {
  form: TaskEditorForm;
  assignees: ProjectDetail["actors"];
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-4 @sm:grid-cols-2">
      <form.Field name="status">
        {(field) => (
          <TaskSelect
            label="Status"
            value={field.state.value}
            onChange={(value) => {
              field.handleChange(value);
              if (!field.state.meta.isValid) void field.validate("blur");
            }}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
            options={taskStatusValues.map((value) => ({ value, label: taskStatusLabels[value] }))}
          />
        )}
      </form.Field>
      <form.Field name="priority">
        {(field) => (
          <TaskSelect
            label="Priority"
            value={field.state.value}
            onChange={(value) => {
              field.handleChange(value);
              if (!field.state.meta.isValid) void field.validate("blur");
            }}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
            options={priorities.map((value) => ({
              value,
              label: value[0]!.toUpperCase() + value.slice(1),
            }))}
          />
        )}
      </form.Field>
      <form.Field name="assignee">
        {(field) => (
          <TaskSelect
            label="Assignee"
            value={field.state.value}
            onChange={(value) => {
              field.handleChange(value);
              if (!field.state.meta.isValid) void field.validate("blur");
            }}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
            options={[
              { value: "unassigned", label: "Unassigned" },
              ...assignees.map((actor) => ({
                value: actor.entityId,
                label: `${actor.name}${actor.type === "agent" ? " (agent)" : ""}`,
              })),
              ...(field.state.value !== "unassigned" &&
              !assignees.some((actor) => actor.entityId === field.state.value)
                ? [
                    {
                      value: field.state.value,
                      label: "Former project member - select a new assignee",
                    },
                  ]
                : []),
            ]}
          />
        )}
      </form.Field>
      <form.Field name="dueDate">
        {(field) => (
          <Field className="min-w-0" data-invalid={!field.state.meta.isValid}>
            <FieldLabel htmlFor={`${id}-due`}>Due date</FieldLabel>
            <Input
              id={`${id}-due`}
              type="date"
              value={field.state.value}
              onChange={(event) => {
                field.handleChange(event.target.value);
                if (!field.state.meta.isValid) void field.validate("blur");
              }}
              onBlur={field.handleBlur}
              aria-invalid={!field.state.meta.isValid}
              aria-describedby={!field.state.meta.isValid ? `${id}-due-error` : undefined}
            />
            <FieldError id={`${id}-due-error`} errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>
    </div>
  );
}
