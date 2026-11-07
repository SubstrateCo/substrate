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
import { SourceTaskReference } from "@/components/context/source-task/source-task-reference";
import { cn } from "cn";

function useTaskForm({
  task,
  initialStatus,
  assignees,
  pending,
  onSubmit,
}: {
  task?: Task;
  initialStatus?: Task["status"];
  assignees: ProjectDetail["actors"];
  pending: boolean;
  onSubmit: (draft: TaskDraft) => void;
}) {
  return useForm({
    defaultValues: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      status: task?.status ?? initialStatus ?? "not_started",
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
  initialStatus,
}: {
  detail: ProjectDetail;
  task?: Task;
  parentTaskEntityId?: string;
  onSubmit: (draft: TaskDraft) => void;
  onCancel: () => void;
  pending?: boolean;
  error?: Error | null;
  sourceText?: string;
  initialStatus?: Task["status"];
}) {
  const id = useId();
  const assignees = detail.actors.filter((actor) =>
    detail.members.some((member) => member.actorEntityId === actor.entityId),
  );
  const form = useTaskForm({ task, assignees, pending, onSubmit, initialStatus });
  const fromMessage = sourceText !== undefined;
  let titleLabel = parentTaskEntityId ? "New subtask" : "New task";
  let submitLabel = parentTaskEntityId ? "Create subtask" : "Create task";
  if (task) {
    titleLabel = "Edit task";
    submitLabel = "Save task";
  }
  return (
    <form
      aria-label={titleLabel}
      aria-busy={pending}
      aria-keyshortcuts={fromMessage ? "Control+Enter Meta+Enter" : undefined}
      noValidate
      className="@container min-w-0 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        void form.handleSubmit();
      }}
      onKeyDown={(event) => {
        if (fromMessage && (event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          if (!pending) void form.handleSubmit();
        }
      }}
    >
      <fieldset
        disabled={pending}
        className={cn("min-w-0 space-y-4", fromMessage && "space-y-3 px-4 pb-4")}
      >
        {!fromMessage && <h3 className="font-semibold">{titleLabel}</h3>}
        <form.Field name="title">
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <FieldLabel htmlFor={`${id}-title`} className={fromMessage ? "sr-only" : undefined}>
                Task title
              </FieldLabel>
              {fromMessage ? (
                <Textarea
                  id={`${id}-title`}
                  value={field.state.value}
                  placeholder="What needs to be done?"
                  rows={2}
                  variant="task-title"
                  className="max-h-32 min-h-14 resize-none scroll-my-2"
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
              ) : (
                <Input
                  variant="surface"
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
              )}
              <FieldError id={`${id}-title-error`} errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <FieldLabel
                htmlFor={`${id}-description`}
                className={fromMessage ? "sr-only" : undefined}
              >
                Task description
              </FieldLabel>
              <Textarea
                id={`${id}-description`}
                value={field.state.value}
                placeholder={fromMessage ? "Add a description…" : undefined}
                variant={fromMessage ? "task-description" : "surface"}
                className={fromMessage ? "max-h-48" : undefined}
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
        <TaskScheduleFields form={form} assignees={assignees} compact={fromMessage} />
        {fromMessage && (
          <SourceTaskReference
            sourceText={sourceText}
            onCopy={() => {
              form.setFieldValue("description", sourceText);
              void form.validateField("description", "blur");
            }}
          />
        )}
        <FormMessage
          error={error}
          errorDescription="Couldn’t save this task. Check its fields and make sure the assignee still has project access."
        />
        <div
          className={cn(
            "flex flex-wrap gap-2",
            fromMessage &&
              "-mx-4 -mb-4 items-center justify-between border-t bg-muted/20 px-4 py-3",
          )}
        >
          {fromMessage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onPointerDown={(event) => event.preventDefault()}
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
          <PendingButton pending={pending} pendingLabel="Saving task…">
            {submitLabel}
            {fromMessage && (
              <kbd aria-hidden className="ml-2 hidden text-xs font-normal opacity-60 @xs:inline">
                Ctrl/⌘ ↵
              </kbd>
            )}
          </PendingButton>
          {!fromMessage && (
            <Button
              type="button"
              variant="outline"
              onPointerDown={(event) => event.preventDefault()}
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
