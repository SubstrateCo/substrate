import { revalidateLogic, useForm } from "@tanstack/react-form";

import { useId } from "react";

import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { Button } from "../../ui/button";
import { Field, FieldError, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import type { ProjectDetail, Task, TaskDraft } from "../types";
import { taskFormSchema } from "./task-form-validation";
import { TaskScheduleFields } from "./task-schedule-fields";

function useTaskForm({
  task,
  assignees,
  pending,
  onSubmit,
}: {
  task?: Task;
  assignees: ProjectDetail["actors"];
  pending: boolean;
  onSubmit: (draft: TaskDraft) => void;
}) {
  return useForm({
    defaultValues: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      status: task?.status ?? "not_started",
      priority: task?.priority ?? "none",
      assignee: task?.assigneeActorEntityId ?? "unassigned",
      dueDate: task?.dueDate ?? "",
    },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    validators: { onDynamic: taskFormSchema(assignees.map((actor) => actor.entityId)) },
    onSubmit: ({ value }) => {
      if (pending) return;
      onSubmit({
        title: value.title,
        description: value.description,
        status: value.status,
        priority: value.priority,
        assigneeActorEntityId: value.assignee === "unassigned" ? null : value.assignee,
        dueDate: value.dueDate || null,
      });
    },
  });
}

export type TaskEditorForm = ReturnType<typeof useTaskForm>;

export function TaskForm({
  detail,
  task,
  parentTaskEntityId,
  onSubmit,
  onCancel,
  pending = false,
  error,
  sourceText,
}: {
  detail: ProjectDetail;
  task?: Task;
  parentTaskEntityId?: string;
  onSubmit: (draft: TaskDraft) => void;
  onCancel: () => void;
  pending?: boolean;
  error?: Error | null;
  sourceText?: string;
}) {
  const id = useId();
  const assignees = detail.actors.filter((actor) =>
    detail.members.some((member) => member.actorEntityId === actor.entityId),
  );
  const form = useTaskForm({ task, assignees, pending, onSubmit });
  let titleLabel = parentTaskEntityId ? "New subtask" : "New task";
  let submitLabel = parentTaskEntityId ? "Create subtask" : "Create task";
  if (task) {
    titleLabel = "Edit task";
    submitLabel = "Save task";
  }
  return (
    <form
      aria-label={titleLabel}
      noValidate
      className="@container min-w-0 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        void form.handleSubmit();
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        <h3 className="font-semibold">{titleLabel}</h3>
        <form.Field name="title">
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <FieldLabel htmlFor={`${id}-title`}>Task title</FieldLabel>
              <Input
                id={`${id}-title`}
                value={field.state.value}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                  if (!field.state.meta.isValid) void field.validate("blur");
                }}
                onBlur={field.handleBlur}
                aria-required
                aria-invalid={!field.state.meta.isValid}
                aria-describedby={!field.state.meta.isValid ? `${id}-title-error` : undefined}
                maxLength={300}
              />
              <FieldError id={`${id}-title-error`} errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <FieldLabel htmlFor={`${id}-description`}>Task description</FieldLabel>
              <Textarea
                id={`${id}-description`}
                value={field.state.value}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                  if (!field.state.meta.isValid) void field.validate("blur");
                }}
                onBlur={field.handleBlur}
                aria-invalid={!field.state.meta.isValid}
                aria-describedby={!field.state.meta.isValid ? `${id}-description-error` : undefined}
                maxLength={20000}
              />
              <FieldError id={`${id}-description-error`} errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        {sourceText && (
          <Button
            type="button"
            variant="outline"
            className="h-auto max-w-full whitespace-normal"
            onClick={() => {
              form.setFieldValue("description", sourceText);
              void form.validateField("description", "blur");
            }}
          >
            Copy source text into description
          </Button>
        )}
        <TaskScheduleFields form={form} assignees={assignees} />
        <FormMessage
          error={error}
          errorDescription="Couldn’t save this task. Check its fields and make sure the assignee still has project access."
        />
        <div className="flex flex-wrap gap-2">
          <PendingButton pending={pending} pendingLabel="Saving task…">
            {submitLabel}
          </PendingButton>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
