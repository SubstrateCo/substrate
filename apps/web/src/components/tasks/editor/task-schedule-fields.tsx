import { useId } from "react";

import { assigneeLabel } from "../assignee/assignee-label";
import { AssigneePicker } from "../assignee/assignee-picker";
import { TaskDueDatePicker } from "../detail/task-due-date-picker";
import { taskPriorityOptions, taskStatusOptions } from "../task-cues/task-options";
import type { ProjectDetail } from "../types";
import type { TaskEditorForm } from "./task-form-view";
import { SelectField } from "@/components/forms/select-field";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { formatShortDate, parseDateOnly } from "@/lib/format/date";
import { ChevronDown } from "lucide-react";

/** Sets the value, then checks an invalid field again so its error clears on a valid choice. */
function change<T>(
  field: {
    handleChange: (value: T) => void;
    state: { meta: { isValid: boolean } };
    validate: (cause: "blur") => void;
  },
  value: T,
) {
  field.handleChange(value);
  if (!field.state.meta.isValid) field.validate("blur");
}

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
          <SelectField
            label="Status"
            value={field.state.value}
            onChange={(value) => change(field, value)}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
            options={taskStatusOptions}
          />
        )}
      </form.Field>
      <form.Field name="priority">
        {(field) => (
          <SelectField
            label="Priority"
            value={field.state.value}
            onChange={(value) => change(field, value)}
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
                trigger={
                  <Button
                    id={`${id}-assignee`}
                    type="button"
                    role="combobox"
                    variant="field"
                    className="min-w-0"
                    onBlur={field.handleBlur}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? `${id}-assignee-error` : undefined}
                  />
                }
              >
                <PersonAvatar
                  size="xs"
                  name={actor?.name}
                  image={actor?.image}
                  agent={actor?.type === "agent"}
                />
                <span className="min-w-0 flex-1 truncate text-left">
                  {value && !actor
                    ? "Former member. Choose someone else."
                    : assigneeLabel(value, actors)}
                </span>
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
                <ChevronDown
                  aria-hidden="true"
                  data-icon="inline-end"
                  className="text-muted-foreground"
                />
              </Button>
            </TaskDueDatePicker>
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>
    </div>
  );
}
