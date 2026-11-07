import { useId, useState } from "react";

import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import type { ProjectDetail, Task, TaskDraft } from "../types";
import { TaskScheduleFields, type TaskScheduleDraft } from "./task-schedule-fields";

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
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [schedule, setSchedule] = useState<TaskScheduleDraft>({
    status: task?.status ?? "not_started",
    priority: task?.priority ?? "none",
    assignee: task?.assigneeActorEntityId ?? "unassigned",
    dueDate: task?.dueDate ?? "",
  });
  const assignees = detail.actors.filter((actor) =>
    detail.members.some((member) => member.actorEntityId === actor.entityId),
  );
  let titleLabel = parentTaskEntityId ? "New subtask" : "New task";
  let submitLabel = parentTaskEntityId ? "Create subtask" : "Create task";
  if (task) {
    titleLabel = "Edit task";
    submitLabel = "Save task";
  }
  return (
    <form
      aria-label={titleLabel}
      className="@container min-w-0 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        onSubmit({
          title,
          description,
          status: schedule.status,
          priority: schedule.priority,
          assigneeActorEntityId: schedule.assignee === "unassigned" ? null : schedule.assignee,
          dueDate: schedule.dueDate || null,
        });
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        <h3 className="font-semibold">{titleLabel}</h3>
        <div className="space-y-2">
          <Label htmlFor={`${id}-title`}>Task title</Label>
          <Input
            id={`${id}-title`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={300}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-description`}>Task description</Label>
          <Textarea
            id={`${id}-description`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={20000}
          />
        </div>
        {sourceText && (
          <Button
            type="button"
            variant="outline"
            className="h-auto max-w-full whitespace-normal"
            onClick={() => setDescription(sourceText)}
          >
            Copy source text into description
          </Button>
        )}
        <TaskScheduleFields
          value={schedule}
          onChange={(change) => setSchedule((current) => ({ ...current, ...change }))}
          assignees={assignees}
        />
        <FormMessage
          error={error}
          errorDescription="Couldn’t save this task. Check its fields and make sure the assignee still has project access."
        />
        <div className="flex flex-wrap gap-2">
          <PendingButton disabled={!title.trim()} pending={pending} pendingLabel="Saving task…">
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
