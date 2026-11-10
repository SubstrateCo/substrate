import { useId } from "react";

import { assigneeLabel, AssigneePicker } from "../assignee/assignee-picker";
import { TaskDueDatePicker } from "../detail/task-due-date-picker";
import { TaskAssigneeAvatar } from "../task-cues/task-assignee-avatar";
import { taskPriorityOptions, taskStatusOptions } from "../task-cues/task-options";
import { TaskSelect } from "../task-select";
import type { ProjectDetail } from "../types";
import type { TaskEditorForm } from "./task-form-view";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { formatShortDate, parseDateOnly } from "@/lib/format/date";
import { ChevronDown } from "lucide-react";

export function TaskScheduleFields({
  form,
  assignees,
  actors,
}: {
  form: TaskEditorForm;
  assignees: ProjectDetail["actors"];
  actors: ProjectDetail["actors"];
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
            options={taskStatusOptions}
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
            options={taskPriorityOptions}
          />
        )}
      </form.Field>
      <form.Field name="assignee">
        {(field) => {
          const value = field.state.value === "unassigned" ? null : field.state.value;
          const actor = actors.find((candidate) => candidate.entityId === value);
          const invalid = field.state.meta.errors.length > 0;
          return (
            <Field className="min-w-0" data-invalid={invalid}>
              <FieldLabel htmlFor={`${id}-assignee`}>Assignee</FieldLabel>
              <AssigneePicker
                value={value}
                assignees={assignees}
                onChange={(next) => {
                  field.handleChange(next ?? "unassigned");
                  void field.validate("blur");
                }}
              >
                {() => (
                  <Button
                    id={`${id}-assignee`}
                    type="button"
                    role="combobox"
                    variant="field"
                    className="min-w-0"
                    onBlur={field.handleBlur}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? `${id}-assignee-error` : undefined}
                  >
                    <TaskAssigneeAvatar name={actor?.name} type={actor?.type} />
                    <span className="min-w-0 flex-1 truncate text-left">
                      {value && !actor
                        ? "Former member. Choose someone else."
                        : assigneeLabel(value, actors)}
                    </span>
                    <ChevronDown aria-hidden="true" className="text-muted-foreground" />
                  </Button>
                )}
              </AssigneePicker>
              <FieldError id={`${id}-assignee-error`} errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>
      <form.Field name="dueDate">
        {(field) => (
          <Field className="min-w-0" data-invalid={field.state.meta.errors.length > 0}>
            <FieldLabel htmlFor={`${id}-due`}>Due date</FieldLabel>
            <TaskDueDatePicker
              value={field.state.value || null}
              onChange={(value) => {
                field.handleChange(value ?? "");
                field.handleBlur();
              }}
            >
              <Button id={`${id}-due`} type="button" variant="field" onBlur={field.handleBlur}>
                <span>
                  {field.state.value
                    ? formatShortDate(parseDateOnly(field.state.value) ?? field.state.value)
                    : "Choose a date"}
                </span>
                <ChevronDown aria-hidden="true" className="text-muted-foreground" />
              </Button>
            </TaskDueDatePicker>
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>
    </div>
  );
}
