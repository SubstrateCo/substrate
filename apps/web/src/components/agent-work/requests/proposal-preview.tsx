import { permissionLabels } from "@substrate/contracts/access/levels";
import { taskStatusLabels } from "@substrate/contracts/tasks";

import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { SkeletonText } from "@/components/feedback/skeleton-text";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { hiddenConversation } from "@/lib/agent-work/hidden-records";
import type {
  ProposalField,
  ProposalRecord,
  ProposalTarget,
  RecordKind,
} from "@/lib/agent-work/proposal-target";

const hiddenText: Record<RecordKind, string> = {
  conversation: hiddenConversation,
  thread: "A thread you can't open",
  project: "A project you can't open",
  task: "A task you can't open",
  message: "A message you can't open",
  person: "Someone you can't see",
  record: "A record you can't open",
  interaction: "An interaction you can't open",
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

function RecordField({
  label,
  record,
  kind,
}: {
  label: string;
  record: ProposalRecord;
  kind: RecordKind;
}) {
  return (
    <Field label={label}>
      <RecordName record={record} kind={kind} />
    </Field>
  );
}

function PreviewFields({ children }: { children: ReactNode }) {
  return <dl className="grid gap-1.5 text-sm">{children}</dl>;
}
export function RecordName({ record, kind }: { record: ProposalRecord; kind: RecordKind }) {
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

function GenericValue({ field }: { field: ProposalField }) {
  if (field.kind === "record") return <RecordName record={field.record} kind={field.recordKind} />;
  return field.markdown ? <MessageMarkdown body={field.text} /> : field.text;
}

export function ProposalPreview({ target }: { target: ProposalTarget }) {
  switch (target.type) {
    case "reply":
      return (
        <div className="grid gap-2">
          <PreviewFields>
            <Field label="Action">{target.thread ? "Reply in a thread" : "Post a message"}</Field>
            <RecordField label="Conversation" record={target.conversation} kind="conversation" />
            {target.thread && <RecordField label="Thread" record={target.thread} kind="thread" />}
          </PreviewFields>
          <blockquote className="rounded-lg border bg-inset px-3 py-2">
            <MessageMarkdown body={target.input.body} />
          </blockquote>
        </div>
      );
    case "create_task":
      return (
        <PreviewFields>
          <Field label="Action">{target.parentTask ? "Create a subtask" : "Create a task"}</Field>
          <RecordField label="Project" record={target.project} kind="project" />
          {target.parentTask && (
            <RecordField label="Parent task" record={target.parentTask} kind="task" />
          )}
          {target.sourceMessage && (
            <RecordField label="From message" record={target.sourceMessage} kind="message" />
          )}
          <TaskFields fields={target.input} assignee={target.assignee} />
        </PreviewFields>
      );
    case "update_task":
      return (
        <PreviewFields>
          <Field label="Action">Change a task</Field>
          <RecordField label="Task" record={target.task} kind="task" />
          <RecordField label="Project" record={target.project} kind="project" />
          {target.parentTask && (
            <RecordField label="Parent task" record={target.parentTask} kind="task" />
          )}
          <TaskFields fields={target.input.changes} assignee={target.assignee} />
        </PreviewFields>
      );
    case "delete_task":
      return (
        <PreviewFields>
          <Field label="Action">Delete a task and its subtasks</Field>
          <RecordField label="Task" record={target.task} kind="task" />
          <RecordField label="Project" record={target.project} kind="project" />
        </PreviewFields>
      );
    case "share_project":
      return (
        <ProjectAccessPreview
          action="Share a project"
          project={target.project}
          person={target.person}
          access={permissionLabels[target.input.level]}
        />
      );
    case "revoke_project_access":
      return (
        <ProjectAccessPreview
          action="Remove access to a project"
          project={target.project}
          person={target.person}
        />
      );
    case "archive_project":
    case "restore_project":
    case "delete_project":
      return (
        <PreviewFields>
          <Field label="Action">{projectActionLabels[target.type]}</Field>
          <RecordField label="Project" record={target.project} kind="project" />
        </PreviewFields>
      );
    case "archive_crm_record":
      return (
        <PreviewFields>
          <Field label="Action">
            {target.input.archived ? "Archive" : "Restore"} {crmKindLabels[target.input.kind]}
          </Field>
          <RecordField label="Record" record={target.record} kind="record" />
        </PreviewFields>
      );
    case "delete_crm_interaction":
      return (
        <PreviewFields>
          <Field label="Action">Delete an interaction</Field>
          <RecordField label="Interaction" record={target.interaction} kind="interaction" />
        </PreviewFields>
      );
    case "assign_crm_owner":
    case "share_crm_record":
    case "revoke_crm_access":
      return (
        <CrmAccessPreview
          action={crmAccessLabels[target.type]}
          record={target.record}
          person={target.person}
          access={crmAccess(target.action)}
        />
      );
    case "generic":
      return (
        <PreviewFields>
          <Field label="Action">{target.title}</Field>
          {target.fields.map((field, index) => (
            <Field key={index} label={field.label}>
              <GenericValue field={field} />
            </Field>
          ))}
        </PreviewFields>
      );
  }
}

function ProjectAccessPreview({
  action,
  project,
  person,
  access,
}: {
  action: string;
  project: ProposalRecord;
  person: ProposalRecord;
  access?: ReactNode;
}) {
  return (
    <PreviewFields>
      <Field label="Action">{action}</Field>
      <RecordField label="Project" record={project} kind="project" />
      <RecordField label="Person" record={person} kind="person" />
      {access && <Field label="Access">{access}</Field>}
    </PreviewFields>
  );
}

function CrmAccessPreview({
  action,
  record,
  person,
  access,
}: {
  action: string;
  record: ProposalRecord;
  person: ProposalRecord;
  access?: ReactNode;
}) {
  return (
    <PreviewFields>
      <Field label="Action">{action}</Field>
      <RecordField label="Record" record={record} kind="record" />
      <RecordField label="Person" record={person} kind="person" />
      {access && <Field label="Access">{access}</Field>}
    </PreviewFields>
  );
}

const crmKindLabels = { account: "an account", contact: "a contact", deal: "a deal" };

const crmAccessLabels = {
  assign_crm_owner: "Make someone responsible for a record",
  share_crm_record: "Share a record",
  revoke_crm_access: "Remove access to a record",
};

function crmAccess(action: Extract<ProposalTarget, { action: unknown }>["action"]) {
  if (action.tool === "share_crm_record") return permissionLabels[action.input.level];
  if (action.tool === "assign_crm_owner")
    return action.input.accessDecision === "keep_restricted"
      ? "Don't share the record"
      : "Only if they can already open it";
  return undefined;
}

const projectActionLabels = {
  archive_project: "Archive a project and make its tasks read-only",
  restore_project: "Restore an archived project",
  delete_project: "Delete a project and all its tasks",
};
