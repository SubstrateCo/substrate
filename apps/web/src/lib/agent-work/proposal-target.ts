import type { ProposalAction } from "@substrate/contracts/agent-work";

import {
  contactLink,
  crmLink,
  interactionLink,
  messageLink,
  workLink,
  type RecordLink,
} from "@/lib/navigation/record-links";

/**
 * A record an action names, as the viewer can see it now. hidden carries no name or link, so the
 * preview never reveals a record the viewer can't open.
 */
export type ProposalRecord =
  | { access: "loading" }
  | { access: "hidden" }
  | { access: "visible"; label: string; link?: RecordLink };

/** The parts of a project's detail the preview reads. Tasks are only the readable ones. */
export interface ProposalProject {
  project: { entityId: string; name: string };
  tasks: readonly { entityId: string; title: string; parentTaskEntityId: string | null }[];
  actors: readonly { entityId: string; name: string }[];
  members: readonly { actorEntityId: string; name: string }[];
}

type ProjectActionType = Extract<
  ProposalAction["type"],
  "archive_project" | "restore_project" | "delete_project"
>;
type AccessActionType = Extract<ProposalAction["type"], "share_project" | "revoke_project_access">;
type CrmPersonActionType = Extract<
  ProposalAction["type"],
  "assign_crm_owner" | "share_crm_record" | "revoke_crm_access"
>;

/** A CRM record the viewer can read, by its kind and name. */
export interface ProposalCrmRecord {
  kind: "account" | "contact" | "deal";
  name: string;
}

/**
 * What the viewer can read now. Each lookup returns undefined while it loads and null when the
 * viewer can't open the record.
 */
export interface ProposalLookups {
  organizationId: string;
  conversation: (conversationId: string) => { name: string } | null | undefined;
  project: (projectId: string) => ProposalProject | null | undefined;
  /** The projects that may hold a task, to find it by ID. Undefined while any loads. */
  projects: readonly ProposalProject[] | undefined;
  /** A message, as a short plain-text label. */
  message: (conversationId: string, messageId: string) => { label: string } | null | undefined;
  /** Where the proposal was made, to find its source message. Null when the viewer can't see it. */
  sourceConversationId: string | null;
  /** An account, contact or deal. */
  crmRecord: (entityId: string) => ProposalCrmRecord | null | undefined;
  /** A contact interaction, labelled by its contact and summary. */
  interaction: (entityId: string) => { label: string } | null | undefined;
  /** A person in the organization, by actor ID. */
  person: (actorId: string) => { name: string } | null | undefined;
}

export type ProposalTarget =
  | { type: "reply_elsewhere"; conversation: ProposalRecord; thread: ProposalRecord | null }
  | {
      type: "create_task";
      project: ProposalRecord;
      parentTask: ProposalRecord | null;
      sourceMessage: ProposalRecord | null;
      assignee: ProposalRecord | null;
    }
  | {
      type: "update_task";
      task: ProposalRecord;
      project: ProposalRecord;
      parentTask: ProposalRecord | null;
      assignee: ProposalRecord | null;
    }
  | { type: "delete_task"; task: ProposalRecord; project: ProposalRecord }
  | { type: ProjectActionType; project: ProposalRecord }
  | { type: AccessActionType; project: ProposalRecord; person: ProposalRecord }
  | { type: "archive_crm_record"; record: ProposalRecord }
  | { type: "delete_crm_interaction"; interaction: ProposalRecord }
  | { type: CrmPersonActionType; record: ProposalRecord; person: ProposalRecord };

const loading: ProposalRecord = { access: "loading" };
const hidden: ProposalRecord = { access: "hidden" };

function resolve<T>(value: T | null | undefined, visible: (value: T) => ProposalRecord) {
  if (value === undefined) return loading;
  if (value === null) return hidden;
  return visible(value);
}

function taskRecord(organizationId: string, detail: ProposalProject, taskId: string) {
  const task = detail.tasks.find((entry) => entry.entityId === taskId);
  if (!task) return hidden;
  return {
    access: "visible",
    label: task.title,
    link: workLink(organizationId, detail.project.entityId, task.entityId),
  } satisfies ProposalRecord;
}

function projectRecord(organizationId: string, detail: ProposalProject): ProposalRecord {
  return {
    access: "visible",
    label: detail.project.name,
    link: workLink(organizationId, detail.project.entityId),
  };
}

/** A null assignee removes the assignee, so it is not a record to resolve. */
function assigneeRecord(detail: ProposalProject | null | undefined, actorId: string | null) {
  if (!actorId) return null;
  return resolve(detail, (project) => {
    const actor = project.actors.find((entry) => entry.entityId === actorId);
    return actor ? { access: "visible", label: actor.name } : hidden;
  });
}

/** A member of the project, or someone who could be added to it. */
function personRecord(detail: ProposalProject | null | undefined, actorId: string) {
  return resolve(detail, (project) => {
    const member = project.members.find((entry) => entry.actorEntityId === actorId);
    const actor = project.actors.find((entry) => entry.entityId === actorId);
    const name = member?.name ?? actor?.name;
    return name ? { access: "visible", label: name } : hidden;
  });
}

/** A CRM record of the expected kinds, linked in its own app. */
function crmRecordTarget(
  lookups: ProposalLookups,
  entityId: string,
  kinds: readonly ProposalCrmRecord["kind"][],
) {
  return resolve(lookups.crmRecord(entityId), (record) => {
    if (!kinds.includes(record.kind)) return hidden;
    return {
      access: "visible",
      label: record.name,
      link:
        record.kind === "contact"
          ? contactLink(lookups.organizationId, entityId)
          : crmLink(lookups.organizationId, `${record.kind}s`, entityId),
    } satisfies ProposalRecord;
  });
}

function crmPerson(lookups: ProposalLookups, actorId: string) {
  return resolve(lookups.person(actorId), ({ name }) => ({ access: "visible", label: name }));
}

/** The project that holds the task, once every readable project has loaded. */
function taskProject(lookups: ProposalLookups, taskId: string) {
  const { projects } = lookups;
  return (
    projects &&
    (projects.find((project) => project.tasks.some((task) => task.entityId === taskId)) ?? null)
  );
}

function namedRecords(target: ProposalTarget): (ProposalRecord | null)[] {
  switch (target.type) {
    case "reply_elsewhere":
      return [target.conversation, target.thread];
    case "create_task":
      return [target.project, target.parentTask, target.sourceMessage, target.assignee];
    case "update_task":
      return [target.task, target.project, target.parentTask, target.assignee];
    case "delete_task":
      return [target.task, target.project];
    case "share_project":
    case "revoke_project_access":
      return [target.project, target.person];
    case "archive_project":
    case "restore_project":
    case "delete_project":
      return [target.project];
    case "archive_crm_record":
      return [target.record];
    case "delete_crm_interaction":
      return [target.interaction];
    case "assign_crm_owner":
    case "share_crm_record":
    case "revoke_crm_access":
      return [target.record, target.person];
  }
}

/** Approval waits until every named record resolves, so the owner sees the exact target first. */
export function proposalTargetLoading(target: ProposalTarget) {
  return namedRecords(target).some((record) => record?.access === "loading");
}

/**
 * The agent acts with its owner's access, so the owner cannot approve a change to a record they
 * can't open: the server would refuse it.
 */
export function proposalTargetHidden(target: ProposalTarget) {
  return namedRecords(target).some((record) => record?.access === "hidden");
}

function sourceRecord(lookups: ProposalLookups, messageId: string | undefined) {
  if (!messageId) return null;
  const conversationId = lookups.sourceConversationId;
  if (!conversationId) return hidden;
  return resolve(lookups.message(conversationId, messageId), ({ label }) => ({
    access: "visible",
    label,
    link: messageLink(lookups.organizationId, conversationId, messageId),
  }));
}

/**
 * Every record the action names, resolved from what the viewer can read, never from the
 * agent's summary. Approval runs the stored action, so the owner must see what it targets.
 */
export function proposalTarget(action: ProposalAction, lookups: ProposalLookups): ProposalTarget {
  const { organizationId } = lookups;
  switch (action.type) {
    case "reply_elsewhere": {
      const { conversationId, threadId } = action.input;
      const conversation = lookups.conversation(conversationId);
      return {
        type: "reply_elsewhere",
        conversation: resolve(conversation, ({ name }) => ({
          access: "visible",
          label: name,
          link: messageLink(organizationId, conversationId),
        })),
        thread: threadId
          ? resolve(conversation && lookups.message(conversationId, threadId), ({ label }) => ({
              access: "visible",
              label,
              link: messageLink(organizationId, conversationId, threadId),
            }))
          : null,
      };
    }
    case "create_task": {
      const { projectId, parentTaskId, sourceMessageId, assigneeActorId } = action.input;
      const detail = lookups.project(projectId);
      return {
        type: "create_task",
        project: resolve(detail, (project) => projectRecord(organizationId, project)),
        parentTask: parentTaskId
          ? resolve(detail, (project) => taskRecord(organizationId, project, parentTaskId))
          : null,
        sourceMessage: sourceRecord(lookups, sourceMessageId),
        assignee: assigneeRecord(detail, assigneeActorId ?? null),
      };
    }
    case "update_task": {
      const { taskId, changes } = action.input;
      const detail = taskProject(lookups, taskId);
      const task = detail?.tasks.find((entry) => entry.entityId === taskId);
      return {
        type: "update_task",
        task: resolve(detail, (project) => taskRecord(organizationId, project, taskId)),
        project: resolve(detail, (project) => projectRecord(organizationId, project)),
        parentTask:
          detail && task?.parentTaskEntityId
            ? taskRecord(organizationId, detail, task.parentTaskEntityId)
            : null,
        assignee: assigneeRecord(detail, changes.assigneeActorId ?? null),
      };
    }
    case "delete_task": {
      const { taskId } = action.input;
      const detail = taskProject(lookups, taskId);
      return {
        type: "delete_task",
        task: resolve(detail, (project) => taskRecord(organizationId, project, taskId)),
        project: resolve(detail, (project) => projectRecord(organizationId, project)),
      };
    }
    case "archive_project":
    case "restore_project":
    case "delete_project": {
      const detail = lookups.project(action.input.projectId);
      return {
        type: action.type,
        project: resolve(detail, (project) => projectRecord(organizationId, project)),
      };
    }
    case "share_project":
    case "revoke_project_access": {
      const detail = lookups.project(action.input.projectId);
      return {
        type: action.type,
        project: resolve(detail, (project) => projectRecord(organizationId, project)),
        person: personRecord(detail, action.input.actorId),
      };
    }
    case "archive_crm_record":
      return {
        type: "archive_crm_record",
        record: crmRecordTarget(lookups, action.input.entityId, [action.input.kind]),
      };
    case "delete_crm_interaction": {
      const { entityId } = action.input;
      return {
        type: "delete_crm_interaction",
        interaction: resolve(lookups.interaction(entityId), ({ label }) => ({
          access: "visible",
          label,
          link: interactionLink(organizationId, entityId),
        })),
      };
    }
    case "assign_crm_owner":
    case "share_crm_record":
      return {
        type: action.type,
        record: crmRecordTarget(lookups, action.input.entityId, ["account", "deal"]),
        person: crmPerson(
          lookups,
          action.type === "assign_crm_owner" ? action.input.ownerActorId : action.input.actorId,
        ),
      };
    case "revoke_crm_access":
      return {
        type: action.type,
        record: crmRecordTarget(lookups, action.input.entityId, ["account", "deal"]),
        person: crmPerson(lookups, action.input.actorId),
      };
  }
}
