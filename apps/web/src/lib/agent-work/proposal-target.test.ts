import type { ProposalAction } from "@substrate/contracts/agent-work";
import type { RecordLabel, RecordLabelType } from "@substrate/contracts/context/input";

import {
  proposalDetailTask,
  proposalRecordIds,
  proposalTarget,
  proposalTargetHidden,
  proposalTargetLoading,
  type ProposalLookups,
  type ProposalProject,
} from "./proposal-target";
import { describe, expect, test } from "bun:test";

// Stored inputs are tool inputs, so record IDs are UUIDs.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = {
  general: id(1),
  secretConversation: id(2),
  question: id(3),
  otherQuestion: id(4),
  launch: id(10),
  secretProject: id(11),
  copy: id(20),
  headline: id(21),
  orphan: id(22),
  unreadableParent: id(23),
  secretTask: id(24),
  dana: id(30),
  lee: id(31),
  stranger: id(32),
  northwind: id(40),
  renewal: id(41),
  ada: id(42),
  intro: id(43),
  stage: id(50),
  secretStage: id(51),
};

const label = (
  entry: string,
  type: RecordLabelType,
  title: string,
  place: { projectId?: string; conversationId?: string } = {},
): RecordLabel => ({
  id: entry,
  type,
  title,
  projectId: place.projectId ?? null,
  conversationId: place.conversationId ?? null,
});

// What the server returns for the viewer: only records they can open.
const labels = new Map(
  [
    label(ids.general, "conversation", "General"),
    label(ids.question, "message", "Can we ship Friday?", { conversationId: ids.general }),
    label(ids.otherQuestion, "message", "Elsewhere", { conversationId: ids.secretConversation }),
    label(ids.launch, "project", "Launch"),
    label(ids.copy, "task", "Write copy", { projectId: ids.launch }),
    label(ids.headline, "task", "Headline", { projectId: ids.launch }),
    label(ids.orphan, "task", "Orphan", { projectId: ids.launch }),
    label(ids.dana, "actor", "Dana"),
    label(ids.lee, "actor", "Lee"),
    label(ids.northwind, "account", "Northwind"),
    label(ids.renewal, "deal", "Northwind renewal"),
    label(ids.ada, "contact", "Ada Park"),
    label(ids.intro, "contact_interaction", "Ada Park: Intro call"),
    label(ids.stage, "pipeline_stage", "Proposal"),
  ].map((entry) => [entry.id, entry]),
);

const project: ProposalProject = {
  project: { entityId: ids.launch, name: "Launch" },
  tasks: [
    { entityId: ids.copy, title: "Write copy", parentTaskEntityId: null },
    { entityId: ids.headline, title: "Headline", parentTaskEntityId: ids.copy },
    { entityId: ids.orphan, title: "Orphan", parentTaskEntityId: ids.unreadableParent },
  ],
};

const lookups: ProposalLookups = {
  organizationId: "org",
  crmEnabled: true,
  label: (entry) => labels.get(entry) ?? null,
  project: (projectId) => (projectId === ids.launch ? project : null),
};

const hidden = { access: "hidden" } as const;
const loading = { access: "loading" } as const;
const call = (tool: string, input: ProposalAction["input"]): ProposalAction => ({ tool, input });

describe("replies to another conversation", () => {
  test("name the conversation and thread with links", () => {
    const target = proposalTarget(
      call("reply", { body: "Yes", to: { conversationId: ids.general, threadId: ids.question } }),
      lookups,
    );
    expect(target).toMatchObject({
      type: "reply",
      input: { body: "Yes" },
      conversation: {
        access: "visible",
        label: "General",
        link: {
          to: "/messages",
          search: { workspaceId: "org", conversationId: ids.general, messageId: undefined },
        },
      },
      thread: {
        access: "visible",
        label: "Can we ship Friday?",
        link: {
          to: "/messages",
          search: { workspaceId: "org", conversationId: ids.general, messageId: ids.question },
        },
      },
    });
  });

  test("a conversation the viewer can't open hides its thread too and blocks approval", () => {
    const target = proposalTarget(
      call("reply", {
        body: "Yes",
        to: { conversationId: ids.secretConversation, threadId: ids.question },
      }),
      lookups,
    );
    expect(target).toMatchObject({ type: "reply", conversation: hidden, thread: hidden });
    expect(proposalTargetHidden(target)).toBe(true);
  });

  test("a thread from another conversation is not the one the reply names", () => {
    const target = proposalTarget(
      call("reply", {
        body: "Yes",
        to: { conversationId: ids.general, threadId: ids.otherQuestion },
      }),
      lookups,
    );
    expect(target).toMatchObject({ conversation: { label: "General" }, thread: hidden });
  });

  test("a reply in the turn's own place shows its fields instead", () => {
    const target = proposalTarget(call("reply", { body: "Done" }), lookups);
    expect(target).toEqual({
      type: "generic",
      title: "Reply",
      fields: [{ label: "Body", kind: "text", text: "Done", markdown: false }],
    });
  });
});

describe("create-task calls", () => {
  test("name the project, parent task, source message and assignee", () => {
    const target = proposalTarget(
      call("create_task", {
        projectId: ids.launch,
        title: "Subhead",
        parentTaskId: ids.copy,
        sourceMessageId: ids.question,
        assigneeActorId: ids.dana,
      }),
      lookups,
    );
    expect(target).toMatchObject({
      type: "create_task",
      input: { title: "Subhead" },
      project: { access: "visible", label: "Launch" },
      parentTask: {
        access: "visible",
        label: "Write copy",
        link: {
          to: "/tasks",
          search: { workspaceId: "org", projectId: ids.launch, taskId: ids.copy },
        },
      },
      sourceMessage: { access: "visible", label: "Can we ship Friday?" },
      assignee: { access: "visible", label: "Dana" },
    });
  });

  test("a project the viewer can't open hides its parent task", () => {
    const target = proposalTarget(
      call("create_task", { projectId: ids.secretProject, title: "X", parentTaskId: ids.copy }),
      lookups,
    );
    expect(target).toMatchObject({ project: hidden, parentTask: hidden, sourceMessage: null });
    expect(proposalTargetHidden(target)).toBe(true);
  });

  test("a source message the viewer can't open is hidden", () => {
    const target = proposalTarget(
      call("create_task", { projectId: ids.launch, title: "X", sourceMessageId: id(99) }),
      lookups,
    );
    expect(target).toMatchObject({ sourceMessage: hidden });
  });

  test("records that are still loading say so, and approval waits", () => {
    const target = proposalTarget(
      call("create_task", { projectId: ids.launch, title: "X", parentTaskId: ids.copy }),
      { ...lookups, label: () => undefined },
    );
    expect(target).toMatchObject({ project: loading, parentTask: loading });
    expect(proposalTargetLoading(target)).toBe(true);
  });
});

describe("update-task calls", () => {
  test("find the exact task, its project and parent", () => {
    const action = call("update_task", { taskId: ids.headline, changes: { status: "completed" } });
    expect(proposalDetailTask(action)).toBe(ids.headline);
    expect(proposalTarget(action, lookups)).toMatchObject({
      type: "update_task",
      input: { changes: { status: "completed" } },
      task: { access: "visible", label: "Headline" },
      project: { access: "visible", label: "Launch" },
      parentTask: { access: "visible", label: "Write copy" },
      assignee: null,
    });
  });

  test("an unreadable parent is hidden, not named", () => {
    const target = proposalTarget(
      call("update_task", { taskId: ids.orphan, changes: { title: "New" } }),
      lookups,
    );
    expect(target).toMatchObject({ task: { label: "Orphan" }, parentTask: hidden });
  });

  test("the project loads after the task's label, and approval waits", () => {
    const action = call("update_task", { taskId: ids.copy, changes: { title: "New" } });
    const target = proposalTarget(action, { ...lookups, project: () => undefined });
    expect(target).toMatchObject({ task: { label: "Write copy" }, project: loading });
    expect(proposalTargetLoading(target)).toBe(true);
    expect(proposalTargetLoading(proposalTarget(action, lookups))).toBe(false);
  });

  // The agent acts with its owner's access, so approving a change to a hidden record cannot work.
  test("approval is blocked while any named record is hidden from the owner", () => {
    const changes = { title: "New" };
    const visible = proposalTarget(call("update_task", { taskId: ids.copy, changes }), lookups);
    const secret = proposalTarget(
      call("update_task", { taskId: ids.secretTask, changes }),
      lookups,
    );
    expect(proposalTargetHidden(visible)).toBe(false);
    expect(secret).toMatchObject({ task: hidden, project: hidden });
    expect(proposalTargetHidden(secret)).toBe(true);
  });
});

describe("delete-task calls", () => {
  test("find the task and its project", () => {
    const target = proposalTarget(call("delete_task", { taskId: ids.headline }), lookups);
    expect(target).toEqual({
      type: "delete_task",
      task: {
        access: "visible",
        label: "Headline",
        link: {
          to: "/tasks",
          search: { workspaceId: "org", projectId: ids.launch, taskId: ids.headline },
        },
      },
      project: {
        access: "visible",
        label: "Launch",
        link: {
          to: "/tasks",
          search: { workspaceId: "org", projectId: ids.launch, taskId: undefined },
        },
      },
    });
  });

  test("a task the viewer can't open blocks approval", () => {
    const target = proposalTarget(call("delete_task", { taskId: ids.secretTask }), lookups);
    expect(target).toEqual({ type: "delete_task", task: hidden, project: hidden });
    expect(proposalTargetHidden(target)).toBe(true);
  });
});

describe("project calls", () => {
  test("name the project to archive", () => {
    const target = proposalTarget(call("archive_project", { projectId: ids.launch }), lookups);
    expect(target).toMatchObject({
      type: "archive_project",
      project: { access: "visible", label: "Launch" },
    });
    expect(proposalTargetHidden(target)).toBe(false);
  });

  test("a project the viewer can't open blocks deletion", () => {
    const target = proposalTarget(
      call("delete_project", { projectId: ids.secretProject }),
      lookups,
    );
    expect(target).toEqual({ type: "delete_project", project: hidden });
    expect(proposalTargetHidden(target)).toBe(true);
  });

  test("sharing and revoking name the person", () => {
    const share = proposalTarget(
      call("share_project", { projectId: ids.launch, actorId: ids.dana, level: "edit" }),
      lookups,
    );
    const revoke = proposalTarget(
      call("revoke_project_access", { projectId: ids.launch, actorId: ids.lee }),
      lookups,
    );
    expect(share).toMatchObject({
      type: "share_project",
      input: { level: "edit" },
      person: { access: "visible", label: "Dana" },
    });
    expect(revoke).toMatchObject({ person: { access: "visible", label: "Lee" } });
  });

  test("a person the viewer can't see is hidden and blocks approval", () => {
    const target = proposalTarget(
      call("share_project", { projectId: ids.launch, actorId: ids.stranger, level: "view" }),
      lookups,
    );
    expect(target).toMatchObject({ person: hidden });
    expect(proposalTargetHidden(target)).toBe(true);
  });
});

describe("CRM calls", () => {
  test("archiving names the record and links it in its own app", () => {
    const deal = proposalTarget(
      call("archive_crm_record", { kind: "deal", entityId: ids.renewal, archived: true }),
      lookups,
    );
    const contact = proposalTarget(
      call("archive_crm_record", { kind: "contact", entityId: ids.ada, archived: false }),
      lookups,
    );
    expect(deal).toMatchObject({
      record: { access: "visible", label: "Northwind renewal", link: { to: "/crm" } },
    });
    expect(contact).toMatchObject({
      record: { access: "visible", label: "Ada Park", link: { to: "/contacts" } },
    });
  });

  test("a contact opens in Interactions when CRM is off", () => {
    const contact = proposalTarget(
      call("archive_crm_record", { kind: "contact", entityId: ids.ada, archived: true }),
      { ...lookups, crmEnabled: false },
    );
    expect(contact).toMatchObject({ record: { link: { to: "/interactions" } } });
  });

  // The stored call names the kind; a record of another kind is not the one it names.
  test("a record of another kind than the call names is hidden", () => {
    const target = proposalTarget(
      call("archive_crm_record", { kind: "account", entityId: ids.renewal, archived: true }),
      lookups,
    );
    expect(target).toMatchObject({ type: "archive_crm_record", record: hidden });
    expect(proposalTargetHidden(target)).toBe(true);
  });

  test("deleting an interaction names it", () => {
    const target = proposalTarget(call("delete_crm_interaction", { entityId: ids.intro }), lookups);
    expect(target).toMatchObject({
      interaction: {
        access: "visible",
        label: "Ada Park: Intro call",
        link: { to: "/interactions" },
      },
    });
  });

  test("ownership and sharing name the account or deal and the person", () => {
    const assign = proposalTarget(
      call("assign_crm_owner", {
        entityId: ids.northwind,
        ownerActorEntityId: ids.lee,
        expectedOwnerActorEntityId: ids.dana,
        accessDecision: "keep_restricted",
      }),
      lookups,
    );
    expect(assign).toMatchObject({
      type: "assign_crm_owner",
      record: { access: "visible", label: "Northwind" },
      person: { access: "visible", label: "Lee" },
    });
    // A contact has no grants, so sharing one names nothing the call could change.
    const contact = proposalTarget(
      call("share_crm_record", { entityId: ids.ada, actorEntityId: ids.lee, level: "view" }),
      lookups,
    );
    expect(contact).toMatchObject({ type: "share_crm_record", record: hidden });
    const stranger = proposalTarget(
      call("revoke_crm_access", { entityId: ids.renewal, actorEntityId: ids.stranger }),
      lookups,
    );
    expect(proposalTargetHidden(stranger)).toBe(true);
  });
});

describe("calls without a typed preview", () => {
  test("show the tool's title and every field, with record IDs named and linked by type", () => {
    const target = proposalTarget(
      call("move_task", { taskId: ids.headline, projectId: ids.launch, parentTaskId: null }),
      lookups,
    );
    expect(target).toEqual({
      type: "generic",
      title: "Move task",
      fields: [
        {
          label: "Task",
          kind: "record",
          recordKind: "record",
          record: {
            access: "visible",
            label: "Headline",
            link: {
              to: "/tasks",
              search: { workspaceId: "org", projectId: ids.launch, taskId: ids.headline },
            },
          },
        },
        {
          label: "Project",
          kind: "record",
          recordKind: "record",
          record: {
            access: "visible",
            label: "Launch",
            link: {
              to: "/tasks",
              search: { workspaceId: "org", projectId: ids.launch, taskId: undefined },
            },
          },
        },
        { label: "Parent task", kind: "text", text: "None", markdown: false },
      ],
    });
    expect(proposalTargetHidden(target)).toBe(false);
    expect(proposalTargetLoading(target)).toBe(false);
  });

  test("nested changes and typed references resolve too", () => {
    const update = proposalTarget(
      call("update_project", { projectId: ids.launch, changes: { name: "Launch v2" } }),
      lookups,
    );
    expect(update).toMatchObject({
      fields: [
        { label: "Project", record: { access: "visible", label: "Launch" } },
        { label: "Name", kind: "text", text: "Launch v2" },
      ],
    });
    const attach = proposalTarget(
      call("attach_message", {
        messageId: ids.question,
        target: { type: "deal", id: ids.renewal },
      }),
      lookups,
    );
    expect(attach).toMatchObject({
      fields: [
        {
          label: "Message",
          record: { access: "visible", label: "Can we ship Friday?", link: { to: "/messages" } },
        },
        {
          label: "Target",
          record: { access: "visible", label: "Northwind renewal", link: { to: "/crm" } },
        },
      ],
    });
  });

  test("a record with no page is named without a link", () => {
    const target = proposalTarget(
      call("transition_crm_deal", {
        entityId: ids.renewal,
        expectedVersion: 2,
        stageId: ids.stage,
        outcome: "open",
      }),
      lookups,
    );
    expect(target.type === "generic" ? target.fields : []).toContainEqual({
      label: "Stage",
      kind: "record",
      recordKind: "record",
      record: { access: "visible", label: "Proposal", link: undefined },
    });
    expect(proposalTargetHidden(target)).toBe(false);
  });

  test("a record ID the viewer can't open is hidden and blocks approval", () => {
    const target = proposalTarget(
      call("add_task_link", { taskId: ids.copy, relation: "blocks", otherTaskId: ids.secretTask }),
      lookups,
    );
    expect(target).toMatchObject({
      fields: [
        { label: "Task", record: { access: "visible" } },
        { label: "Relation", text: "blocks" },
        { label: "Other task", record: hidden, recordKind: "record" },
      ],
    });
    expect(proposalTargetHidden(target)).toBe(true);
  });

  test("approval waits while labels load", () => {
    const target = proposalTarget(
      call("move_task", { taskId: ids.copy, projectId: ids.launch, parentTaskId: null }),
      { ...lookups, label: () => undefined },
    );
    expect(proposalTargetLoading(target)).toBe(true);
  });

  test("every record ID in the call is read once, at any depth", () => {
    expect(
      proposalRecordIds(
        call("attach_message", {
          messageId: ids.question,
          target: { type: "task", id: ids.copy },
          notes: ["plain", ids.question],
        }),
      ),
    ).toEqual([ids.question, ids.copy]);
    expect(proposalDetailTask(call("move_task", { taskId: ids.copy }))).toBeUndefined();
  });
});
