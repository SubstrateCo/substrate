import { taskPriorityValues, taskStatusValues, taskStatusLabels } from "@substrate/contracts/tasks";
import type { taskFields } from "@substrate/contracts/tasks/input";
import { assignableActors } from "@substrate/contracts/tasks/project-access";

import { useState } from "react";

import { taskPriorityLabels } from "@/features/records/format";
import type { ProjectActor, ProjectTask } from "@/features/records/requests";
import { dateFieldValid, DateField, SelectField, TextField } from "@/features/records/ui/fields";
import { FormSheet } from "@/features/records/ui/sheet";
import type { z } from "zod";

export type TaskDraft = z.input<typeof taskFields>;

const unassigned = "unassigned";

export function TaskForm({
  task,
  parentTitle,
  actors,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  task?: ProjectTask;
  parentTitle?: string;
  actors: ProjectActor[];
  pending: boolean;
  error: Error | null;
  onSubmit: (draft: TaskDraft) => void;
  onClose: () => void;
}) {
  const initial: TaskDraft = {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "not_started",
    priority: task?.priority ?? "none",
    assigneeActorEntityId: task?.assigneeActorEntityId ?? null,
    dueDate: task?.dueDate ?? null,
  };
  const [draft, setDraft] = useState(initial);
  const [due, setDue] = useState(initial.dueDate ?? "");
  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const dirty = JSON.stringify({ ...draft, dueDate: due || null }) !== JSON.stringify(initial);
  const title = draft.title.trim();
  const assignees = assignableActors({ actors }, initial.assigneeActorEntityId);
  let formTitle = "New task";
  if (task) formTitle = "Edit task";
  else if (parentTitle) formTitle = "New subtask";
  return (
    <FormSheet
      title={formTitle}
      description={parentTitle ? `Subtask of ${parentTitle}` : undefined}
      saveLabel={task ? "Save" : "Create"}
      dirty={dirty}
      pending={pending}
      canSave={title.length > 0 && dateFieldValid(due)}
      error={error}
      onClose={onClose}
      onSave={() => onSubmit({ ...draft, title, dueDate: due || null })}
    >
      <TextField
        label="Title"
        value={draft.title}
        onChange={(value) => set("title", value)}
        maxLength={300}
        autoFocus={!task}
        placeholder="What needs to happen?"
      />
      <SelectField
        label="Status"
        value={draft.status}
        onChange={(value) => set("status", value)}
        choices={taskStatusValues.map((value) => ({ value, label: taskStatusLabels[value] }))}
      />
      <SelectField
        label="Priority"
        value={draft.priority}
        onChange={(value) => set("priority", value)}
        choices={taskPriorityValues.map((value) => ({ value, label: taskPriorityLabels[value] }))}
      />
      <SelectField
        label="Assignee"
        value={draft.assigneeActorEntityId ?? unassigned}
        onChange={(value) => set("assigneeActorEntityId", value === unassigned ? null : value)}
        choices={[
          { value: unassigned, label: "Unassigned" },
          ...assignees.map((actor) => ({
            value: actor.entityId,
            label: actor.name,
            description: actor.type === "agent" ? "Agent" : undefined,
          })),
        ]}
        description="Only people and agents who can read this project appear here."
      />
      <DateField label="Due date" value={due} onChange={setDue} />
      <TextField
        label="Description"
        value={draft.description}
        onChange={(value) => set("description", value)}
        multiline
        maxLength={20000}
        placeholder="Add details"
      />
    </FormSheet>
  );
}
