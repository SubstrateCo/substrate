import { assignableActors } from "@substrate/contracts/tasks/project-access";

import { revalidateLogic, useForm } from "@tanstack/react-form";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { PendingButton } from "../../feedback/pending-button";
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
  onDirtyChange,
}: {
  task?: Task;
  initialStatus?: Task["status"];
  assignees: ProjectDetail["actors"];
  pending: boolean;
  onSubmit: (draft: TaskDraft) => void;
  onDirtyChange?: (dirty: boolean) => void;
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
    listeners: {
      onChange: ({ formApi }) => {
        if (!task || !onDirtyChange) return;
        const { title, description } = formApi.state.values;
        onDirtyChange(title !== task.title || description !== task.description);
      },
    },
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

const errorDescription =
  "Couldn’t save this task. Check its fields and make sure the assignee still has project access.";

function isSaveShortcut(event: KeyboardEvent<HTMLElement>) {
  return event.key === "Enter" && (event.ctrlKey || event.metaKey);
}

type TaskFormProps = {
  detail: ProjectDetail;
  onSubmit: (draft: TaskDraft) => void;
  pending: boolean;
  error?: Error | null;
};

export function TaskForm({
  task,
  onCancel,
  pending = false,
  initialStatus,
  renderCreate,
  onDirtyChange,
  attachments,
  attachmentsReady = true,
  ...form
}: Omit<TaskFormProps, "pending"> & {
  task?: Task;
  onCancel: () => void;
  pending?: boolean;
  initialStatus?: Task["status"];
  renderCreate?: (editor: FormDialogEditor) => ReactNode;
  onDirtyChange?: (dirty: boolean) => void;
  attachments?: ReactNode;
  attachmentsReady?: boolean;
}) {
  if (renderCreate)
    return (
      <TaskCreateForm
        {...form}
        pending={pending}
        initialStatus={initialStatus}
        renderCreate={renderCreate}
        attachments={attachments}
        attachmentsReady={attachmentsReady}
      />
    );
  if (!task) return null;
  return (
    <TaskInlineEditForm
      {...form}
      pending={pending}
      task={task}
      onCancel={onCancel}
      onDirtyChange={onDirtyChange}
    />
  );
}

function TaskTextFields({ form }: { form: TaskEditorForm }) {
  const id = useId();
  return (
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
            description="Supports Markdown."
            multiline
            maxLength={20000}
          />
        )}
      </form.Field>
    </>
  );
}

function TaskCreateForm({
  detail,
  onSubmit,
  pending,
  error,
  initialStatus,
  renderCreate,
  attachments,
  attachmentsReady,
}: TaskFormProps & {
  initialStatus?: Task["status"];
  renderCreate: (editor: FormDialogEditor) => ReactNode;
  attachments?: ReactNode;
  attachmentsReady: boolean;
}) {
  const assignees = assignableActors(detail);
  const form = useTaskForm({
    assignees,
    pending: pending || !attachmentsReady,
    initialStatus,
    onSubmit,
  });
  const submit = () => {
    if (!pending && attachmentsReady) void form.handleSubmit();
  };
  return renderCreate({
    fields: (
      <div className="@container min-w-0 space-y-4">
        <TaskTextFields form={form} />
        <TaskScheduleFields form={form} assignees={assignees} actors={detail.actors} />
        {attachments}
      </div>
    ),
    onKeyDown: (event) => {
      if (!isSaveShortcut(event)) return;
      event.preventDefault();
      submit();
    },
    pending,
    disabled: !attachmentsReady,
    error,
    errorDescription,
    onSubmit: submit,
  });
}

function TaskInlineEditForm({
  detail,
  task,
  onSubmit,
  onCancel,
  pending,
  error,
  onDirtyChange,
}: TaskFormProps & {
  task: Task;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const initial = useRef(task);
  const form = useTaskForm({
    task,
    assignees: assignableActors(detail, task.assigneeActorEntityId),
    pending,
    // The form reads its options again after each render, so `task` here is the latest one.
    onSubmit: (draft) =>
      onSubmit({
        ...draft,
        title: draft.title === initial.current.title ? task.title : draft.title,
        description:
          draft.description === initial.current.description ? task.description : draft.description,
        status: task.status,
        priority: task.priority,
        assigneeActorEntityId: task.assigneeActorEntityId,
        dueDate: task.dueDate,
      }),
    onDirtyChange,
  });
  const submit = () => {
    if (!pending) void form.handleSubmit();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (isSaveShortcut(event)) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && !pending) {
      event.preventDefault();
      onCancel();
    }
  };
  return (
    <form
      aria-label="Edit task"
      aria-busy={pending}
      noValidate
      className="@container min-w-0 space-y-4"
      onKeyDown={onKeyDown}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        <TaskTextFields form={form} />
        <FormMessage error={error} errorDescription={errorDescription} />
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onPointerDown={(event) => event.preventDefault()}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <PendingButton type="submit" pending={pending}>
          Save
        </PendingButton>
      </div>
    </form>
  );
}
