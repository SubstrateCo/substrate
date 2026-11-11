import type { ProposalAction } from "@substrate/contracts/agent-work";

import {
  proposalTarget,
  proposalTargetHidden,
  proposalTargetLoading,
  type ProposalLookups,
  type ProposalProject,
} from "./proposal-target";
import { describe, expect, test } from "bun:test";

const project: ProposalProject = {
  project: { entityId: "p1", name: "Launch" },
  tasks: [
    { entityId: "t1", title: "Write copy", parentTaskEntityId: null },
    { entityId: "t2", title: "Headline", parentTaskEntityId: "t1" },
    { entityId: "t3", title: "Orphan", parentTaskEntityId: "unreadable" },
  ],
  actors: [{ entityId: "actor", name: "Dana" }],
};

const lookups: ProposalLookups = {
  organizationId: "org",
  conversation: (id) => (id === "c1" ? { name: "General" } : null),
  project: (id) => (id === "p1" ? project : null),
  projects: [project],
  message: (conversationId, id) =>
    conversationId === "c1" && id === "m1" ? { label: "Can we ship Friday?" } : null,
  sourceConversationId: "c1",
};

const hidden = { access: "hidden" } as const;
const loading = { access: "loading" } as const;

describe("reply proposals", () => {
  test("name the conversation and thread with links", () => {
    expect(
      proposalTarget(
        {
          type: "reply_elsewhere",
          input: { conversationId: "c1", threadId: "m1", body: "Yes" },
        },
        lookups,
      ),
    ).toEqual({
      type: "reply_elsewhere",
      conversation: {
        access: "visible",
        label: "General",
        link: {
          to: "/dashboard",
          search: { workspaceId: "org", conversationId: "c1", messageId: undefined },
        },
      },
      thread: {
        access: "visible",
        label: "Can we ship Friday?",
        link: {
          to: "/dashboard",
          search: { workspaceId: "org", conversationId: "c1", messageId: "m1" },
        },
      },
    });
  });

  test("a conversation the viewer can't open hides its thread too", () => {
    const target = proposalTarget(
      { type: "reply_elsewhere", input: { conversationId: "c2", threadId: "m1", body: "Yes" } },
      lookups,
    );
    expect(target).toEqual({ type: "reply_elsewhere", conversation: hidden, thread: hidden });
  });
});

describe("create-task proposals", () => {
  test("name the project, parent task, source message and assignee", () => {
    const target = proposalTarget(
      {
        type: "create_task",
        input: {
          projectId: "p1",
          title: "Subhead",
          parentTaskId: "t1",
          sourceMessageId: "m1",
          assigneeActorId: "actor",
        },
      },
      lookups,
    );
    expect(target).toMatchObject({
      project: { access: "visible", label: "Launch" },
      parentTask: {
        access: "visible",
        label: "Write copy",
        link: { to: "/tasks", search: { workspaceId: "org", projectId: "p1", taskId: "t1" } },
      },
      sourceMessage: { access: "visible", label: "Can we ship Friday?" },
      assignee: { access: "visible", label: "Dana" },
    });
  });

  test("a project the viewer can't open hides its parent task and assignee", () => {
    const target = proposalTarget(
      {
        type: "create_task",
        input: { projectId: "p2", title: "X", parentTaskId: "t1", assigneeActorId: "actor" },
      },
      lookups,
    );
    expect(target).toEqual({
      type: "create_task",
      project: hidden,
      parentTask: hidden,
      sourceMessage: null,
      assignee: hidden,
    });
  });

  test("a source message is hidden when the proposal's conversation is hidden", () => {
    const target = proposalTarget(
      { type: "create_task", input: { projectId: "p1", title: "X", sourceMessageId: "m1" } },
      { ...lookups, sourceConversationId: null },
    );
    expect(target).toMatchObject({ sourceMessage: hidden });
  });

  test("records that are still loading say so", () => {
    const target = proposalTarget(
      { type: "create_task", input: { projectId: "p1", title: "X", parentTaskId: "t1" } },
      { ...lookups, project: () => undefined },
    );
    expect(target).toMatchObject({ project: loading, parentTask: loading });
  });
});

describe("update-task proposals", () => {
  test("find the exact task, its project and parent across readable projects", () => {
    const target = proposalTarget(
      { type: "update_task", input: { taskId: "t2", changes: { status: "completed" } } },
      lookups,
    );
    expect(target).toEqual({
      type: "update_task",
      task: {
        access: "visible",
        label: "Headline",
        link: { to: "/tasks", search: { workspaceId: "org", projectId: "p1", taskId: "t2" } },
      },
      project: {
        access: "visible",
        label: "Launch",
        link: {
          to: "/tasks",
          search: { workspaceId: "org", projectId: "p1", taskId: undefined },
        },
      },
      parentTask: {
        access: "visible",
        label: "Write copy",
        link: { to: "/tasks", search: { workspaceId: "org", projectId: "p1", taskId: "t1" } },
      },
      assignee: null,
    });
  });

  test("an unreadable parent is hidden, not named", () => {
    const target = proposalTarget(
      { type: "update_task", input: { taskId: "t3", changes: { title: "New" } } },
      lookups,
    );
    expect(target).toMatchObject({ task: { label: "Orphan" }, parentTask: hidden });
  });

  test("a task the viewer can't open is hidden with its project", () => {
    const target = proposalTarget(
      { type: "update_task", input: { taskId: "secret", changes: { title: "New" } } },
      lookups,
    );
    expect(target).toEqual({
      type: "update_task",
      task: hidden,
      project: hidden,
      parentTask: null,
      assignee: null,
    });
  });

  test("the task loads until every readable project has loaded, and approval waits", () => {
    const action: ProposalAction = {
      type: "update_task",
      input: { taskId: "t1", changes: { title: "New" } },
    };
    const target = proposalTarget(action, { ...lookups, projects: undefined });
    expect(target).toMatchObject({ task: loading, project: loading });
    expect(proposalTargetLoading(target)).toBe(true);
    expect(proposalTargetLoading(proposalTarget(action, lookups))).toBe(false);
  });

  // The agent acts with its owner's access, so approving a change to a hidden record cannot work.
  test("approval is blocked while any named record is hidden from the owner", () => {
    const changes = { title: "New" };
    const visible = proposalTarget(
      { type: "update_task", input: { taskId: "t1", changes } },
      lookups,
    );
    const secret = proposalTarget(
      { type: "update_task", input: { taskId: "secret", changes } },
      lookups,
    );
    expect(proposalTargetHidden(visible)).toBe(false);
    expect(proposalTargetHidden(secret)).toBe(true);
  });
});
