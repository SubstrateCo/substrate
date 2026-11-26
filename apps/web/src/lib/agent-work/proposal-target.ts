import type { ProposalAction } from "@substrate/contracts/agent-work";
import type { RecordLabel, RecordLabelType } from "@substrate/contracts/context/input";
import { mcpTools } from "@substrate/contracts/harness/tools";

import {
  linkedWorkLink,
  messageLink,
  workLink,
  type RecordLink,
} from "@/lib/navigation/record-links";
import { z } from "zod";

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
}

/** What a hidden record is, so its placeholder can say so without naming it. */
export type RecordKind =
  | "conversation"
  | "thread"
  | "project"
  | "task"
  | "message"
  | "person"
  | "record"
  | "interaction";

/**
 * What the viewer can read now. Each lookup returns undefined while it loads and null when the
 * viewer can't open the record.
 */
export interface ProposalLookups {
  organizationId: string;
  /** Contacts open in Contacts with CRM on, and in Interactions with it off. */
  crmEnabled: boolean;
  /** The name and type of a record ID in the call's input. */
  label: (id: string) => RecordLabel | null | undefined;
  /** A project's detail, read only for a task change, to name its project and parent. */
  project: (projectId: string) => ProposalProject | null | undefined;
}

// Each stored input is the tool's input without requestId, so each typed preview parses it with
// the tool's own schema. An input that does not parse gets the generic preview.
const typedInputs = {
  reply: mcpTools.reply.input.omit({ requestId: true }),
  create_task: mcpTools.create_task.input.omit({ requestId: true }),
  update_task: mcpTools.update_task.input.omit({ requestId: true }),
  delete_task: mcpTools.delete_task.input.omit({ requestId: true }),
  archive_project: mcpTools.archive_project.input.omit({ requestId: true }),
  restore_project: mcpTools.restore_project.input.omit({ requestId: true }),
  delete_project: mcpTools.delete_project.input.omit({ requestId: true }),
  share_project: mcpTools.share_project.input.omit({ requestId: true }),
  revoke_project_access: mcpTools.revoke_project_access.input.omit({ requestId: true }),
  archive_crm_record: mcpTools.archive_crm_record.input.omit({ requestId: true }),
  delete_crm_interaction: mcpTools.delete_crm_interaction.input.omit({ requestId: true }),
  assign_crm_owner: mcpTools.assign_crm_owner.input.omit({ requestId: true }),
  share_crm_record: mcpTools.share_crm_record.input.omit({ requestId: true }),
  revoke_crm_access: mcpTools.revoke_crm_access.input.omit({ requestId: true }),
};
type TypedTool = keyof typeof typedInputs;
type Input<K extends TypedTool> = z.output<(typeof typedInputs)[K]>;
type TypedAction = { [K in TypedTool]: { tool: K; input: Input<K> } }[TypedTool];

function typedAction(action: ProposalAction): TypedAction | null {
  if (!Object.hasOwn(typedInputs, action.tool)) return null;
  // SAFETY: hasOwn checked that the name is a key of typedInputs.
  const tool = action.tool as TypedTool;
  const parsed = typedInputs[tool].safeParse(action.input);
  // A reply without `to` posts in the turn's own place, which the generic preview shows.
  if (!parsed.success || (tool === "reply" && !("to" in parsed.data && parsed.data.to)))
    return null;
  // SAFETY: the input was parsed with the schema of the same tool.
  return { tool, input: parsed.data } as TypedAction;
}

/** A field of a stored call, as the generic preview shows it. */
export type ProposalField =
  | { label: string; kind: "text"; text: string; markdown: boolean }
  | { label: string; kind: "record"; record: ProposalRecord; recordKind: RecordKind };

type ProjectTool = "archive_project" | "restore_project" | "delete_project";
type CrmPersonTool = "assign_crm_owner" | "share_crm_record" | "revoke_crm_access";

export type ProposalTarget =
  | {
      type: "reply";
      input: Input<"reply">;
      conversation: ProposalRecord;
      thread: ProposalRecord | null;
    }
  | {
      type: "create_task";
      input: Input<"create_task">;
      project: ProposalRecord;
      parentTask: ProposalRecord | null;
      sourceMessage: ProposalRecord | null;
      assignee: ProposalRecord | null;
    }
  | {
      type: "update_task";
      input: Input<"update_task">;
      task: ProposalRecord;
      project: ProposalRecord;
      parentTask: ProposalRecord | null;
      assignee: ProposalRecord | null;
    }
  | { type: "delete_task"; task: ProposalRecord; project: ProposalRecord }
  | { type: ProjectTool; project: ProposalRecord }
  | {
      type: "share_project";
      input: Input<"share_project">;
      project: ProposalRecord;
      person: ProposalRecord;
    }
  | { type: "revoke_project_access"; project: ProposalRecord; person: ProposalRecord }
  | { type: "archive_crm_record"; input: Input<"archive_crm_record">; record: ProposalRecord }
  | { type: "delete_crm_interaction"; interaction: ProposalRecord }
  | {
      type: CrmPersonTool;
      action: Extract<TypedAction, { tool: CrmPersonTool }>;
      record: ProposalRecord;
      person: ProposalRecord;
    }
  | { type: "generic"; title: string; fields: ProposalField[] };

const loading: ProposalRecord = { access: "loading" };
const hidden: ProposalRecord = { access: "hidden" };

function resolve<T>(value: T | null | undefined, visible: (value: T) => ProposalRecord) {
  if (value === undefined) return loading;
  if (value === null) return hidden;
  return visible(value);
}

/** Where a record opens, by its type. People, stages, task links and contact details have no page. */
function labelLink(lookups: ProposalLookups, label: RecordLabel): RecordLink | undefined {
  const { organizationId } = lookups;
  switch (label.type) {
    case "conversation":
      return messageLink(organizationId, label.id);
    case "message":
      return label.conversationId
        ? messageLink(organizationId, label.conversationId, label.id)
        : undefined;
    case "task":
    case "project":
    case "account":
    case "contact":
    case "deal":
    case "contact_interaction":
    case "calendar_event":
      return linkedWorkLink(
        organizationId,
        { projectEntityId: label.projectId, entityType: label.type, entityId: label.id },
        lookups.crmEnabled,
      );
    case "actor":
    case "pipeline_stage":
    case "task_link":
    case "contact_detail":
      return undefined;
  }
}

/**
 * A record ID, named from the viewer's own reads. A record of another type than the call expects
 * is not the one it names, so it is hidden.
 */
function labelRecord(
  lookups: ProposalLookups,
  id: string,
  types?: readonly RecordLabelType[],
): ProposalRecord {
  return resolve(lookups.label(id), (label) =>
    types && !types.includes(label.type)
      ? hidden
      : { access: "visible", label: label.title, link: labelLink(lookups, label) },
  );
}

function projectRecord(organizationId: string, detail: ProposalProject): ProposalRecord {
  return {
    access: "visible",
    label: detail.project.name,
    link: workLink(organizationId, detail.project.entityId),
  };
}

function parentRecord(organizationId: string, detail: ProposalProject, taskId: string) {
  const task = detail.tasks.find((entry) => entry.entityId === taskId);
  if (!task) return hidden;
  return {
    access: "visible",
    label: task.title,
    link: workLink(organizationId, detail.project.entityId, task.entityId),
  } satisfies ProposalRecord;
}

/** The project that holds a task, from the task's label. Null when the viewer can't open it. */
function taskProject(lookups: ProposalLookups, taskId: string) {
  const label = lookups.label(taskId);
  if (label === undefined) return undefined;
  return label?.type === "task" && label.projectId ? lookups.project(label.projectId) : null;
}

type Json = ProposalAction["input"][string];
type JsonObject = Record<string, Json>;
const recordId = z.uuid();
const jsonObject = z.record(z.string(), z.json());
const primitive = z.union([z.string(), z.number()]);
/** A typed record reference, such as attach_message's target. The label names its type. */
const typedRef = z.strictObject({ type: z.string(), id: z.uuid() });

function humanize(key: string) {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A field's name without its ID suffix: assigneeActorId is "Assignee". */
function fieldLabel(key: string) {
  const name = key.replace(/(Actor)?(Entity)?Ids?$/, "");
  if (name === "actor") return "Person";
  if (!name || name === "entity") return key === "actorId" ? "Person" : "Record";
  return humanize(name);
}

function textOf(value: Json) {
  if (value === null) return "None";
  if (value === true) return "Yes";
  if (value === false) return "No";
  const text = primitive.safeParse(value);
  return text.success ? String(text.data) : JSON.stringify(value);
}

type GenericField =
  | { label: string; kind: "text"; text: string; markdown: boolean }
  | { label: string; kind: "id"; id: string };

/** Every field of a stored call, with each record ID left to resolve. */
function genericFields(input: JsonObject) {
  const fields: GenericField[] = [];
  const visit = (key: string, value: Json, prefix: string, ownLabel?: string): void => {
    const label = ownLabel ?? prefix + fieldLabel(key);
    const object = jsonObject.safeParse(value);
    const id = recordId.safeParse(value);
    const ref = typedRef.safeParse(value);
    if (ref.success) fields.push({ label, kind: "id", id: ref.data.id });
    else if (Array.isArray(value)) {
      if (value.length === 0) fields.push({ label, kind: "text", text: "None", markdown: false });
      value.forEach((entry, index) =>
        visit(key.replace(/s$/, ""), entry, prefix, `${label} ${index + 1}`),
      );
    } else if (object.success)
      for (const [child, entry] of Object.entries(object.data))
        visit(child, entry, ownLabel ? `${ownLabel}: ` : prefix);
    else if (id.success) fields.push({ label, kind: "id", id: id.data });
    else {
      const text = textOf(value);
      fields.push({
        label,
        kind: "text",
        text,
        markdown: text.includes("\n") || text.length > 120,
      });
    }
  };
  for (const [key, value] of Object.entries(input)) if (key !== "requestId") visit(key, value, "");
  return fields;
}

/** Every record ID in a stored call, at any depth, for one batched label read. */
export function proposalRecordIds(action: ProposalAction): string[] {
  const ids = new Set<string>();
  const visit = (value: Json) => {
    const id = recordId.safeParse(value);
    const object = jsonObject.safeParse(value);
    if (id.success) ids.add(id.data);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (object.success) Object.values(object.data).forEach(visit);
  };
  Object.values(action.input).forEach(visit);
  return [...ids];
}

/** The task whose project detail a typed preview reads, to name its project and parent. */
export function proposalDetailTask(action: ProposalAction): string | undefined {
  const typed = typedAction(action);
  return typed?.tool === "update_task" || typed?.tool === "delete_task"
    ? typed.input.taskId
    : undefined;
}

function namedRecords(target: ProposalTarget): (ProposalRecord | null)[] {
  switch (target.type) {
    case "reply":
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
    case "generic":
      return target.fields.flatMap((field) => (field.kind === "record" ? [field.record] : []));
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

/** The tool's title, or its name for a tool this version does not know. */
function toolTitle(tool: string) {
  // SAFETY: hasOwn checked that the name is a key of mcpTools.
  return Object.hasOwn(mcpTools, tool) ? mcpTools[tool as keyof typeof mcpTools].title : tool;
}

const person = (lookups: ProposalLookups, actorId: string) =>
  labelRecord(lookups, actorId, ["actor"]);
const grantTypes: readonly RecordLabelType[] = ["account", "deal"];

function typedTarget(action: TypedAction, lookups: ProposalLookups): ProposalTarget {
  const { organizationId } = lookups;
  switch (action.tool) {
    case "reply": {
      // typedAction keeps only replies with `to`.
      const { conversationId, threadId } = action.input.to ?? { conversationId: "" };
      const conversation = labelRecord(lookups, conversationId, ["conversation"]);
      // A thread in a conversation the viewer can't open, or in another one, is hidden too.
      const thread = (id: string) => {
        if (conversation.access === "hidden") return hidden;
        return resolve(lookups.label(id), (label) =>
          label.type === "message" && label.conversationId === conversationId
            ? labelRecord(lookups, id)
            : hidden,
        );
      };
      return {
        type: "reply",
        input: action.input,
        conversation,
        thread: threadId ? thread(threadId) : null,
      };
    }
    case "create_task": {
      const { projectId, parentTaskId, sourceMessageId, assigneeActorId } = action.input;
      const project = labelRecord(lookups, projectId, ["project"]);
      // The parent must be a task of the same project.
      const parent = (id: string) =>
        resolve(lookups.label(id), (label) =>
          label.type === "task" && label.projectId === projectId && project.access !== "hidden"
            ? labelRecord(lookups, id)
            : hidden,
        );
      return {
        type: "create_task",
        input: action.input,
        project,
        parentTask: parentTaskId ? parent(parentTaskId) : null,
        sourceMessage: sourceMessageId ? labelRecord(lookups, sourceMessageId, ["message"]) : null,
        assignee: assigneeActorId ? person(lookups, assigneeActorId) : null,
      };
    }
    case "update_task": {
      const { taskId, changes } = action.input;
      const detail = taskProject(lookups, taskId);
      const parentId = detail?.tasks.find((entry) => entry.entityId === taskId)?.parentTaskEntityId;
      return {
        type: "update_task",
        input: action.input,
        task: labelRecord(lookups, taskId, ["task"]),
        project: resolve(detail, (project) => projectRecord(organizationId, project)),
        // The parent is not in the call, so the project's readable tasks name it.
        parentTask: detail && parentId ? parentRecord(organizationId, detail, parentId) : null,
        assignee: changes.assigneeActorId ? person(lookups, changes.assigneeActorId) : null,
      };
    }
    case "delete_task": {
      const detail = taskProject(lookups, action.input.taskId);
      return {
        type: "delete_task",
        task: labelRecord(lookups, action.input.taskId, ["task"]),
        project: resolve(detail, (project) => projectRecord(organizationId, project)),
      };
    }
    case "archive_project":
    case "restore_project":
    case "delete_project":
      return {
        type: action.tool,
        project: labelRecord(lookups, action.input.projectId, ["project"]),
      };
    case "share_project":
    case "revoke_project_access": {
      const project = labelRecord(lookups, action.input.projectId, ["project"]);
      const member = person(lookups, action.input.actorId);
      return action.tool === "share_project"
        ? { type: "share_project", input: action.input, project, person: member }
        : { type: "revoke_project_access", project, person: member };
    }
    case "archive_crm_record":
      return {
        type: "archive_crm_record",
        input: action.input,
        record: labelRecord(lookups, action.input.entityId, [action.input.kind]),
      };
    case "delete_crm_interaction":
      return {
        type: "delete_crm_interaction",
        interaction: labelRecord(lookups, action.input.entityId, ["contact_interaction"]),
      };
    case "assign_crm_owner":
    case "share_crm_record":
    case "revoke_crm_access": {
      const personId =
        action.tool === "assign_crm_owner"
          ? action.input.ownerActorEntityId
          : action.input.actorEntityId;
      return {
        type: action.tool,
        action,
        record: labelRecord(lookups, action.input.entityId, grantTypes),
        person: person(lookups, personId),
      };
    }
  }
}

/**
 * Every record the stored call names, resolved from what the viewer can read, never from the
 * agent's words. Approval runs the stored call, so the owner must see what it targets. Tools
 * without a typed preview show each input field.
 */
export function proposalTarget(action: ProposalAction, lookups: ProposalLookups): ProposalTarget {
  const typed = typedAction(action);
  if (typed) return typedTarget(typed, lookups);
  return {
    type: "generic",
    title: toolTitle(action.tool),
    fields: genericFields(action.input).map((field) =>
      field.kind === "text"
        ? field
        : {
            label: field.label,
            kind: "record",
            record: labelRecord(lookups, field.id),
            recordKind: "record",
          },
    ),
  };
}
