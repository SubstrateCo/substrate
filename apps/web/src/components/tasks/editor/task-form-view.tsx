import { revalidateLogic, useForm } from "@tanstack/react-form";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";

import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { Button } from "../../ui/button";
import { DialogBody, DialogFooter } from "../../ui/dialog";
import { assignableActors } from "../assignee/assignable";
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

/**
 * Creates a task in a dialog, or edits a task's title and description inline. Status, priority,
 * assignee, and due date of an existing task are edited in place, so the inline form keeps their
 * latest values when it saves.
 */
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
  onDirtyChange,
}: {
  detail: ProjectDetail;
  task?: Task;
  parentTaskEntityId?: string;
  onSubmit: (draft: TaskDraft) => void;
  onCancel: () => void;
  pending?: boolean;
  error?: Error | null;
  initialStatus?: Task["status"];
  /** In a dialog, the form renders the dialog's body and its Cancel and submit footer. */
  variant?: "inline" | "dialog";
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const id = useId();
  const latest = useRef(task);
  useEffect(() => {
    latest.current = task;
  });
  const assignees = assignableActors(detail, task?.assigneeActorEntityId);
  const form = useTaskForm({
    task,
    assignees,
    pending,
    initialStatus,
    onSubmit: (draft) => {
      const current = latest.current;
      onSubmit(
        current && variant === "inline"
          ? {
              ...draft,
              status: current.status,
              priority: current.priority,
              assigneeActorEntityId: current.assigneeActorEntityId,
              dueDate: current.dueDate,
            }
          : draft,
      );
    },
  });
  let formLabel = parentTaskEntityId ? "New subtask" : "New task";
  let submitLabel = parentTaskEntityId ? "Create subtask" : "Create task";
  if (task) {
    formLabel = "Edit task";
    submitLabel = "Save task";
  }
  const submit = () => {
    if (!pending) void form.handleSubmit();
  };
  // Ctrl+Enter (Cmd+Enter on macOS) saves from any field. Escape cancels an inline edit.
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && variant === "inline" && !pending) {
      event.preventDefault();
      onCancel();
    }
  };
  const fields = (
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      <form.Field name="title">
        {(field) => (
          <FormTextField
            field={field}
            id={`${id}-title`}
            label="Task title"
            variant="surface"
            autoFocus
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
      {variant === "dialog" && (
        <TaskScheduleFields form={form} assignees={assignees} actors={detail.actors} />
      )}
      <FormMessage
        error={error}
        errorDescription="Couldn't save this task. Check its fields and make sure the assignee still has project access."
      />
    </fieldset>
  );
  const actions = (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onPointerDown={(event) => event.preventDefault()}
        onClick={onCancel}
      >
        Cancel
      </Button>
      <PendingButton pending={pending} pendingLabel="Saving task.">
        {submitLabel}
      </PendingButton>
    </>
  );
  return (
    <form
      aria-label={formLabel}
      aria-busy={pending}
      noValidate
      className="@container min-w-0 space-y-4"
      onKeyDown={onKeyDown}
      onInputCapture={(event) => {
        if (!task || !onDirtyChange) return;
        const title = event.currentTarget.querySelector<HTMLInputElement>(`[id="${id}-title"]`);
        const description = event.currentTarget.querySelector<HTMLTextAreaElement>(
          `[id="${id}-description"]`,
        );
        onDirtyChange(title?.value !== task.title || description?.value !== task.description);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {variant === "dialog" ? (
        <>
          <DialogBody className="@container">{fields}</DialogBody>
          <DialogFooter>{actions}</DialogFooter>
        </>
      ) : (
        <>
          {fields}
          <div className="flex justify-end gap-2">{actions}</div>
        </>
      )}
    </form>
  );
}
