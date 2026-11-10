import { revalidateLogic, useForm } from "@tanstack/react-form";

import { useId } from "react";

import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { Button } from "../../ui/button";
import { DialogFooter } from "../../ui/dialog";
import type { ProjectDetail, Task, TaskDraft } from "../types";
import { taskFormSchema } from "./task-form-validation";
import { TaskScheduleFields } from "./task-schedule-fields";
import { FormTextField } from "@/components/forms/form-text-field";

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
  initialStatus,
  variant = "inline",
}: {
  detail: ProjectDetail;
  task?: Task;
  parentTaskEntityId?: string;
  onSubmit: (draft: TaskDraft) => void;
  onCancel: () => void;
  pending?: boolean;
  error?: Error | null;
  initialStatus?: Task["status"];
  /** In a dialog, the dialog's close button cancels; the form only renders its submit action. */
  variant?: "inline" | "dialog";
}) {
  const id = useId();
  // People need direct project access. Your own agents use your access. Keep the current assignee.
  const assignees = detail.actors.filter(
    (actor) =>
      actor.entityId === task?.assigneeActorEntityId ||
      (actor.assignable &&
        (actor.type === "agent" ||
          detail.members.some((member) => member.actorEntityId === actor.entityId))),
  );
  const form = useTaskForm({ task, assignees, pending, onSubmit, initialStatus });
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
            <FormTextField
              field={field}
              id={`${id}-title`}
              label="Task title"
              variant="surface"
              aria-required
              maxLength={300}
            />
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <FormTextField
              field={field}
              id={`${id}-description`}
              label="Task description"
              multiline
              variant="surface"
              maxLength={20000}
            />
          )}
        </form.Field>
        <TaskScheduleFields form={form} assignees={assignees} />
        <FormMessage
          error={error}
          errorDescription="Couldn't save this task. Check its fields and make sure the assignee still has project access."
        />
        {variant === "dialog" ? (
          <DialogFooter>
            <PendingButton pending={pending} pendingLabel="Saving task.">
              {submitLabel}
            </PendingButton>
          </DialogFooter>
        ) : (
          <div className="flex flex-wrap gap-2">
            <PendingButton pending={pending} pendingLabel="Saving task.">
              {submitLabel}
            </PendingButton>
            <Button
              type="button"
              variant="outline"
              onPointerDown={(event) => event.preventDefault()}
              onClick={onCancel}
            >
              Cancel
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
