import { taskStatusLabels, taskStatusValues } from "@startup-os/contracts/tasks";

import { useId } from "react";

import { TaskSelect } from "../task-select";
import type { ProjectDetail, Task } from "../types";
import type { TaskEditorForm } from "./task-form-view";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "cn";
import { Circle, Signal, UserRound } from "lucide-react";

const priorities: Task["priority"][] = ["none", "low", "medium", "high", "urgent"];

export function TaskScheduleFields({
  form,
  assignees,
  compact = false,
}: {
  form: TaskEditorForm;
  assignees: ProjectDetail["actors"];
  compact?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn("grid min-w-0 gap-4 @sm:grid-cols-2", compact && "flex flex-wrap gap-2")}>
      <form.Field name="status">
        {(field) => (
          <TaskSelect
            label="Status"
            compact={compact}
            icon={
              compact ? <Circle aria-hidden className="size-3 text-muted-foreground" /> : undefined
            }
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
            compact={compact}
            icon={
              compact ? <Signal aria-hidden className="size-3 text-muted-foreground" /> : undefined
            }
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
            compact={compact}
            icon={
              compact ? (
                <UserRound aria-hidden className="size-3 text-muted-foreground" />
              ) : undefined
            }
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
                      label: "Former project member — select a new assignee",
                    },
                  ]
                : []),
            ]}
          />
        )}
      </form.Field>
      <form.Field name="dueDate">
        {(field) => (
          <Field
            className={cn("min-w-0", compact && "relative w-auto max-w-full")}
            data-invalid={!field.state.meta.isValid}
          >
            <FieldLabel htmlFor={`${id}-due`} className={compact ? "sr-only" : undefined}>
              Due date
            </FieldLabel>
            <Input
              id={`${id}-due`}
              type="date"
              variant={compact ? "compact" : "default"}
              className={compact ? "w-36 max-w-full" : undefined}
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
