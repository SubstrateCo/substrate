import { revalidateLogic, useForm } from "@tanstack/react-form";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { PendingButton } from "../../feedback/pending-button";
import { assignableActors } from "../assignee/assignable";
import type { ProjectDetail, Task, TaskDraft } from "../types";
import { taskFormSchema } from "./task-form-validation";
import { TaskScheduleFields } from "./task-schedule-fields";
import type { FormDialogEditor } from "@/components/feedback/form-dialog";
import { FormMessage } from "@/components/feedback/form-message";
import { FormTextField } from "@/components/forms/form-text-field";
import { Button } from "@/components/ui/button";

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
  renderCreate,
  onDirtyChange,
  attachments,
  attachmentsReady = true,
}: {
  detail: ProjectDetail;
  task?: Task;
  parentTaskEntityId?: string;
  onSubmit: (draft: TaskDraft) => void;
  onCancel: () => void;
  pending?: boolean;
  error?: Error | null;
  initialStatus?: Task["status"];
  renderCreate?: (editor: FormDialogEditor) => ReactNode;
  onDirtyChange?: (dirty: boolean) => void;
  attachments?: ReactNode;
  attachmentsReady?: boolean;
}) {
  const id = useId();
  const initial = useRef(task);
  const assignees = assignableActors(detail, task?.assigneeActorEntityId);
  const form = useTaskForm({
    task,
    assignees,
    pending: pending || !attachmentsReady,
    initialStatus,
    // The form reads its options again after each render, so `task` here is the latest one.
    onSubmit: (draft) => {
      const current = task;
      onSubmit(
        current && !renderCreate
          ? {
              ...draft,
              title: draft.title === initial.current?.title ? current.title : draft.title,
              description:
                draft.description === initial.current?.description
                  ? current.description
                  : draft.description,
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
    submitLabel = "Save";
  }
  const submit = () => {
    if (!pending && attachmentsReady) void form.handleSubmit();
  };
  // Ctrl+Enter (Cmd+Enter on macOS) saves from any field. Escape cancels an inline edit.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && !renderCreate && !pending) {
      event.preventDefault();
      onCancel();
    }
  };
  const fields = (
    <>
      <form.Field name="title">
        {(field) => (
          <FormTextField
            field={field}
            id={`${id}-title`}
            label="Task title"
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
            maxLength={20000}
          />
        )}
      </form.Field>
      {renderCreate && (
        <TaskScheduleFields form={form} assignees={assignees} actors={detail.actors} />
      )}
      {attachments}
    </>
  );
  const errorDescription =
    "Couldn’t save this task. Check its fields and make sure the assignee still has project access.";
  if (renderCreate)
    return renderCreate({
      fields: <div className="@container min-w-0 space-y-4">{fields}</div>,
      onKeyDown,
      pending,
      disabled: !attachmentsReady,
      error,
      errorDescription,
      onSubmit: submit,
    });
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
      <PendingButton type="submit" pending={pending} disabled={!attachmentsReady}>
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
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        {fields}
        <FormMessage error={error} errorDescription={errorDescription} />
      </fieldset>
      <div className="flex justify-end gap-2">{actions}</div>
    </form>
  );
}
