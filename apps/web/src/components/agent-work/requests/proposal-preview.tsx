import type { ProposalAction } from "@substrate/contracts/agent-work";
import { taskStatusLabels } from "@substrate/contracts/tasks";

import type { ReactNode } from "react";

import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import type { ProposalRecord, ProposalTarget } from "@/lib/agent-work/proposal-target";

export const hiddenConversation = "A conversation you can’t open";

const hiddenText = {
  conversation: hiddenConversation,
  thread: "A thread you can’t open",
  project: "A project you can’t open",
  task: "A task you can’t open",
  message: "A message you can’t open",
  person: "Someone you can’t see",
};

type TaskChanges = Partial<{
  title: string;
  description: string;
  status: keyof typeof taskStatusLabels;
  priority: string;
  assigneeActorId: string | null;
  dueDate: string | null;
}>;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 wrap-anywhere">{children}</dd>
    </div>
  );
}

/** A named record, as a link when the viewer can open it. */
export function RecordName({
  record,
  kind,
}: {
  record: ProposalRecord;
  kind: keyof typeof hiddenText;
}) {
  if (record.access === "loading") return <span className="text-muted-foreground">Loading…</span>;
  if (record.access === "hidden")
    return <span className="text-muted-foreground">{hiddenText[kind]}</span>;
  return record.href ? (
    <a href={record.href} className="font-medium text-primary hover:underline">
      {record.label}
    </a>
  ) : (
    <span className="font-medium">{record.label}</span>
  );
}

function TaskFields({
  fields,
  assignee,
}: {
  fields: TaskChanges;
  assignee: ProposalRecord | null;
}) {
  return (
    <>
      {fields.title !== undefined && <Field label="Title">{fields.title}</Field>}
      {fields.status !== undefined && (
        <Field label="Status">{taskStatusLabels[fields.status]}</Field>
      )}
      {fields.priority !== undefined && <Field label="Priority">{fields.priority}</Field>}
      {fields.assigneeActorId !== undefined && (
        <Field label="Assignee">
          {fields.assigneeActorId === null || !assignee ? (
            "No one"
          ) : (
            <RecordName record={assignee} kind="person" />
          )}
        </Field>
      )}
      {fields.dueDate !== undefined && <Field label="Due">{fields.dueDate ?? "No due date"}</Field>}
      {fields.description !== undefined && (
        <Field label="Description">
          {fields.description ? <MessageMarkdown body={fields.description} /> : "Empty"}
        </Field>
      )}
    </>
  );
}

/**
 * Exactly what approval does. The server runs this action as stored, so the preview shows every
 * field the agent set and names each target record from the viewer's own reads, never from the
 * agent's summary.
 */
export function ProposalPreview({
  action,
  target,
}: {
  action: ProposalAction;
  target: ProposalTarget;
}) {
  if (action.type === "reply_elsewhere" && target.type === "reply_elsewhere")
    return (
      <div className="grid gap-2">
        <dl className="grid gap-1.5 text-sm">
          <Field label="Action">
            {action.input.threadId ? "Reply in a thread" : "Post a message"}
          </Field>
          <Field label="Conversation">
            <RecordName record={target.conversation} kind="conversation" />
          </Field>
          {target.thread && (
            <Field label="Thread">
              <RecordName record={target.thread} kind="thread" />
            </Field>
          )}
        </dl>
        <blockquote className="rounded-md border bg-muted/40 px-3 py-2">
          <MessageMarkdown body={action.input.body} />
        </blockquote>
      </div>
    );
  if (action.type === "create_task" && target.type === "create_task")
    return (
      <dl className="grid gap-1.5 text-sm">
        <Field label="Action">{target.parentTask ? "Create a subtask" : "Create a task"}</Field>
        <Field label="Project">
          <RecordName record={target.project} kind="project" />
        </Field>
        {target.parentTask && (
          <Field label="Parent task">
            <RecordName record={target.parentTask} kind="task" />
          </Field>
        )}
        {target.sourceMessage && (
          <Field label="From message">
            <RecordName record={target.sourceMessage} kind="message" />
          </Field>
        )}
        <TaskFields fields={action.input} assignee={target.assignee} />
      </dl>
    );
  if (action.type === "update_task" && target.type === "update_task")
    return (
      <dl className="grid gap-1.5 text-sm">
        <Field label="Action">Change a task</Field>
        <Field label="Task">
          <RecordName record={target.task} kind="task" />
        </Field>
        <Field label="Project">
          <RecordName record={target.project} kind="project" />
        </Field>
        {target.parentTask && (
          <Field label="Parent task">
            <RecordName record={target.parentTask} kind="task" />
          </Field>
        )}
        <TaskFields fields={action.input.changes} assignee={target.assignee} />
      </dl>
    );
  return null;
}
