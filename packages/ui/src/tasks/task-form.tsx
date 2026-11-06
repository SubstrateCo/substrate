import { useId, useState } from "react";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";
import { Textarea } from "../primitives/textarea";
import { Spinner } from "../primitives/spinner";
import { FormMessage } from "../auth/form-message";
import type { ProjectDetail, Task, TaskDraft } from "./types";
import { TaskSelect } from "./task-select";

const priorities: Task["priority"][] = ["none", "low", "medium", "high", "urgent"];

export function TaskForm({
  detail,
  task,
  parentTaskEntityId,
  onSubmit,
  onCancel,
  pending = false,
  error,
}: {
  detail: ProjectDetail;
  task?: Task;
  parentTaskEntityId?: string;
  onSubmit: (draft: TaskDraft) => void;
  onCancel: () => void;
  pending?: boolean;
  error?: Error | null;
}) {
  const id = useId();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [statusId, setStatusId] = useState(task?.statusId ?? detail.statuses[0]!.id);
  const [priority, setPriority] = useState<Task["priority"]>(task?.priority ?? "none");
  const [assignee, setAssignee] = useState(task?.assigneeActorEntityId ?? "unassigned");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const assignees = detail.actors.filter((actor) =>
    detail.members.some((member) => member.actorEntityId === actor.entityId),
  );
  return (
    <form
      aria-label={task ? "Edit task" : parentTaskEntityId ? "New subtask" : "New task"}
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        onSubmit({
          title,
          description,
          statusId,
          priority,
          assigneeActorEntityId: assignee === "unassigned" ? null : assignee,
          dueDate: dueDate || null,
        });
      }}
    >
      <h3 className="font-semibold">
        {task ? "Edit task" : parentTaskEntityId ? "New subtask" : "New task"}
      </h3>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <TaskSelect
          label="Status"
          value={statusId}
          onChange={setStatusId}
          options={detail.statuses.map((status) => ({ value: status.id, label: status.name }))}
        />
        <TaskSelect
          label="Priority"
          value={priority}
          onChange={setPriority}
          options={priorities.map((value) => ({
            value,
            label: value[0]!.toUpperCase() + value.slice(1),
          }))}
        />
        <TaskSelect
          label="Assignee"
          value={assignee}
          onChange={setAssignee}
          options={[
            { value: "unassigned", label: "Unassigned" },
            ...assignees.map((actor) => ({
              value: actor.entityId,
              label: `${actor.name}${actor.type === "agent" ? " (agent)" : ""}`,
            })),
            ...(assignee !== "unassigned" && !assignees.some((actor) => actor.entityId === assignee)
              ? [{ value: assignee, label: "Former project member — select a new assignee" }]
              : []),
          ]}
        />
        <div className="space-y-2">
          <Label htmlFor={`${id}-due`}>Due date</Label>
          <Input
            id={`${id}-due`}
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>
      </div>
      <FormMessage
        error={error}
        errorDescription="Couldn’t save this task. Check its fields and make sure the assignee still has project access."
      />
      <div className="flex gap-2">
        <Button disabled={pending || !title.trim()}>
          {pending && <Spinner />}
          {pending
            ? "Saving task…"
            : task
              ? "Save task"
              : parentTaskEntityId
                ? "Create subtask"
                : "Create task"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
