import type { ProposalAction } from "@substrate/contracts/agent-work";

import { messageLink, workLink, type RecordLink } from "@/lib/navigation/record-links";

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
    };

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

function namedRecords(target: ProposalTarget): (ProposalRecord | null)[] {
  if (target.type === "reply_elsewhere") return [target.conversation, target.thread];
  if (target.type === "create_task")
    return [target.project, target.parentTask, target.sourceMessage, target.assignee];
  return [target.task, target.project, target.parentTask, target.assignee];
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
      const projects = lookups.projects;
      const detail =
        projects &&
        (projects.find((project) => project.tasks.some((task) => task.entityId === taskId)) ??
          null);
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
  }
}
