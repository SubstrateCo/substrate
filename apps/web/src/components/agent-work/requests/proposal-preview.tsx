import type { ProposalAction } from "@substrate/contracts/agent-work";
import { taskStatusLabels } from "@substrate/contracts/tasks";

import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { SkeletonText } from "@/components/feedback/skeleton-text";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { projectPermissionLabels } from "@/components/tasks/types";
import { hiddenConversation } from "@/lib/agent-work/hidden-records";
import type { ProposalRecord, ProposalTarget } from "@/lib/agent-work/proposal-target";

const hiddenText = {
  conversation: hiddenConversation,
  thread: "A thread you can’t open",
  project: "A project you can’t open",
  task: "A task you can’t open",
  message: "A message you can’t open",
  person: "Someone you can’t see",
  record: "A record you can’t open",
  interaction: "An interaction you can’t open",
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
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-muted-foreground sm:w-24">{label}</dt>
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
  if (record.access === "loading")
    return (
      <span role="status" aria-label="Loading">
        <SkeletonText width="8rem" />
      </span>
    );
  if (record.access === "hidden")
    return <span className="text-muted-foreground">{hiddenText[kind]}</span>;
  return record.link ? (
    <Link {...record.link} className="font-medium text-primary hover:underline">
      {record.label}
    </Link>
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
        <blockquote className="rounded-lg border bg-inset px-3 py-2">
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
  if (target.type === "delete_task")
    return (
      <dl className="grid gap-1.5 text-sm">
        <Field label="Action">Delete a task and its subtasks</Field>
        <Field label="Task">
          <RecordName record={target.task} kind="task" />
        </Field>
        <Field label="Project">
          <RecordName record={target.project} kind="project" />
        </Field>
      </dl>
    );
  if (target.type === "share_project" || target.type === "revoke_project_access")
    return (
      <dl className="grid gap-1.5 text-sm">
        <Field label="Action">
          {target.type === "share_project" ? "Share a project" : "Remove access to a project"}
        </Field>
        <Field label="Project">
          <RecordName record={target.project} kind="project" />
        </Field>
        <Field label="Person">
          <RecordName record={target.person} kind="person" />
        </Field>
        {action.type === "share_project" && (
          <Field label="Access">{projectPermissionLabels[action.input.level]}</Field>
        )}
      </dl>
    );
  if (
    target.type === "archive_project" ||
    target.type === "restore_project" ||
    target.type === "delete_project"
  )
    return (
      <dl className="grid gap-1.5 text-sm">
        <Field label="Action">{projectActionLabels[target.type]}</Field>
        <Field label="Project">
          <RecordName record={target.project} kind="project" />
        </Field>
      </dl>
    );
  if (action.type === "archive_crm_record" && target.type === "archive_crm_record")
    return (
      <dl className="grid gap-1.5 text-sm">
        <Field label="Action">
          {action.input.archived ? "Archive" : "Restore"} {crmKindLabels[action.input.kind]}
        </Field>
        <Field label="Record">
          <RecordName record={target.record} kind="record" />
        </Field>
      </dl>
    );
  if (target.type === "delete_crm_interaction")
    return (
      <dl className="grid gap-1.5 text-sm">
        <Field label="Action">Delete an interaction</Field>
        <Field label="Interaction">
          <RecordName record={target.interaction} kind="interaction" />
        </Field>
      </dl>
    );
  if (
    target.type === "assign_crm_owner" ||
    target.type === "share_crm_record" ||
    target.type === "revoke_crm_access"
  )
    return (
      <dl className="grid gap-1.5 text-sm">
        <Field label="Action">{crmAccessLabels[target.type]}</Field>
        <Field label="Record">
          <RecordName record={target.record} kind="record" />
        </Field>
        <Field label="Person">
          <RecordName record={target.person} kind="person" />
        </Field>
        {action.type === "share_crm_record" && (
          <Field label="Access">{projectPermissionLabels[action.input.level]}</Field>
        )}
        {action.type === "assign_crm_owner" && (
          <Field label="Access">
            {action.input.accessDecision === "keep_restricted"
              ? "Don’t share the record"
              : "Only if they can already open it"}
          </Field>
        )}
      </dl>
    );
  return null;
}

const crmKindLabels = { account: "an account", contact: "a contact", deal: "a deal" };

const crmAccessLabels = {
  assign_crm_owner: "Make someone responsible for a record",
  share_crm_record: "Share a record",
  revoke_crm_access: "Remove access to a record",
};

const projectActionLabels = {
  archive_project: "Archive a project and make its tasks read-only",
  restore_project: "Restore an archived project",
  delete_project: "Delete a project and all its tasks",
};
