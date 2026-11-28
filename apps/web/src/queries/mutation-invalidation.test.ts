import { advanceTimersAsync } from "@substrate/contracts/testing/timers";

import { QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query";

import { staleSearches } from "./context/mutations";
import { queryKeys } from "./keys";
import {
  forgetRemovedConversation,
  invalidateAddedMembers,
  invalidateRemovedConversation,
  invalidateSentMessage,
  updateSentMessageHistory,
} from "./messaging/mutations";
import { messagesQueryOptions } from "./messaging/options";
import { invalidateTasksWrite } from "./tasks/mutations";
import type { listMessages, Message } from "@/api/messaging/requests";
import { afterEach, beforeEach, expect, vi, test } from "bun:test";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const taskId = "00000000-0000-4000-8000-000000000001";
const context = queryKeys.context("org");

test("archive and restore refresh project lists, details, discussions, backlinks, and searches", async () => {
  for (const action of ["archiveProject", "restoreProject"] as const) {
    const client = new QueryClient();
    const keys = [
      queryKeys.projects("org"),
      queryKeys.archivedProjects("org"),
      queryKeys.project("org", "source"),
      queryKeys.conversations("org"),
      queryKeys.related("org", taskId),
      ...queryKeys.searches("org").map((key) => [...key, "task"]),
    ];
    for (const key of keys) client.setQueryData(key, { title: "Cached" });
    const foreign = queryKeys.projects("foreign");
    client.setQueryData(foreign, { title: "Other organization" });
    try {
      await invalidateTasksWrite(
        client,
        { action, organizationId: "org", projectEntityId: "source" },
        "source",
      );
      for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
      expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
    } finally {
      client.clear();
    }
  }
});

test("task deletion and moves clear cached work and references without touching another organization", async () => {
  for (const action of ["deleteProject", "deleteTask", "moveTask"] as const) {
    const client = new QueryClient();
    const keys = [
      queryKeys.project("org", "source"),
      queryKeys.project("org", "destination"),
      queryKeys.taskAttachments("org", "source", taskId),
      queryKeys.taskLocation("org", taskId),
      queryKeys.conversations("org"),
      queryKeys.conversationList("org", "discussion"),
      queryKeys.messages("org", "discussion"),
      queryKeys.related("org", taskId),
      queryKeys.activity("org", taskId),
      queryKeys.notifications("org"),
      [...queryKeys.messagePages("org"), "conversation", ["message"]],
      ...queryKeys.searches("org").map((key) => [...key, "private task"]),
    ];
    for (const key of keys) client.setQueryData(key, { title: "Private task" });
    const foreign = queryKeys.project("foreign", "project");
    client.setQueryData(foreign, { title: "Other organization" });
    try {
      await invalidateTasksWrite(
        client,
        {
          action,
          organizationId: "org",
          projectEntityId: "source",
          taskEntityId: taskId,
          destinationProjectEntityId: "destination",
          parentTaskEntityId: null,
        },
        taskId,
      );
      for (const key of keys) expect(client.getQueryData(key)).toBeUndefined();
      expect(client.getQueryData(foreign)).toEqual({ title: "Other organization" });
    } finally {
      client.clear();
    }
  }
});

function mount(entries: Record<string, { key: QueryKey; data?: unknown }>) {
  const client = new QueryClient();
  const reads: Record<string, number> = {};
  const unsubscribes = Object.entries(entries).map(([name, { key, data = [] }]) => {
    reads[name] = 0;
    const read = async () => {
      reads[name]++;
      return data;
    };
    return new QueryObserver(client, {
      queryKey: key,
      initialData: data,
      staleTime: Infinity,
      queryFn: () => read(),
    }).subscribe(() => {});
  });
  return {
    client,
    reads,
    close: () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      client.clear();
    },
  };
}

test("sending a work reference refreshes its project discussions, not other conversations or work", async () => {
  const fixture = mount({
    conversations: { key: queryKeys.conversations("org") },
    channel: { key: queryKeys.messages("org", "conversation") },
    thread: { key: queryKeys.messages("org", "conversation", "root") },
    history: { key: [...queryKeys.messages("org", "conversation"), { before: "older" }] },
    otherConversation: { key: queryKeys.messages("org", "other") },
    page: { key: [...context, "message-pages", "conversation", ["message"]] },
    otherPage: { key: [...context, "message-pages", "other", ["other"]] },
    relatedTask: { key: [...context, "related", taskId] },
    relatedProject: { key: [...context, "related", "project"] },
    otherWork: { key: [...context, "related", "other"] },
    activity: { key: [...context, "activity", taskId] },
    otherActivity: { key: [...context, "activity", "other"] },
    project: { key: queryKeys.project("org", "project"), data: { tasks: [{ entityId: taskId }] } },
    catalog: { key: queryKeys.projects("org") },
    search: { key: [...context, "search", "term"] },
    searchPages: { key: [...context, "search-pages", "term"] },
    notifications: { key: [...context, "notifications"] },
    member: { key: queryKeys.organizationSummary("org") },
    otherWorkspace: { key: queryKeys.messages("other", "conversation") },
  });
  try {
    await fixture.client.invalidateQueries({ queryKey: queryKeys.organization("org") });
    expect(Object.values(fixture.reads).reduce((sum, count) => sum + count, 0)).toBe(18);
    for (const name of Object.keys(fixture.reads)) fixture.reads[name] = 0;
    await invalidateSentMessage(
      fixture.client,
      "org",
      "conversation",
      `New discussion @[task:${taskId}]`,
    );
    expect(fixture.reads).toEqual({
      conversations: 0,
      channel: 0,
      thread: 0,
      history: 0,
      otherConversation: 0,
      page: 0,
      otherPage: 0,
      relatedTask: 1,
      relatedProject: 1,
      otherWork: 0,
      activity: 0,
      otherActivity: 0,
      project: 0,
      catalog: 0,
      search: 0,
      searchPages: 0,
      notifications: 0,
      member: 0,
      otherWorkspace: 0,
    });
  } finally {
    fixture.close();
  }
});

test("a sent message joins its loaded page through one read of newer messages", async () => {
  const client = new QueryClient();
  const options = messagesQueryOptions("org", "conversation");
  // SAFETY: history updates only read and append rows by ID.
  const rows = (...ids: string[]) => ids.map((id) => ({ id }) as Message);
  let fullReads = 0;
  const observer = new QueryObserver(client, {
    ...options,
    initialData: rows("first"),
    staleTime: Infinity,
    queryFn: async () => {
      fullReads++;
      return rows("first", "sent");
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  const after: (string | undefined)[] = [];
  // SAFETY: history updates read only `data.afterMessageId` and the returned rows' IDs.
  const load = (async ({ data }: Parameters<typeof listMessages>[0]) => {
    after.push(data.afterMessageId);
    return rows("sent");
  }) as typeof listMessages;
  try {
    const location = { organizationId: "org", conversationId: "conversation" };
    await updateSentMessageHistory(client, location, "sent", load);
    expect(observer.getCurrentResult().data?.map((row) => row.id)).toEqual(["first", "sent"]);
    expect(after).toEqual(["first"]);
    await updateSentMessageHistory(client, { ...location, threadId: "root" }, "reply", load);
    expect(after).toEqual(["first"]);
    expect(fullReads).toBe(0);
  } finally {
    unsubscribe();
    client.clear();
  }
});

test("local replies refresh cached root and reply target counts without realtime, within their conversation and workspace", async () => {
  const client = new QueryClient();
  const scopes = [
    ["org", "conversation", "root"],
    ["org", "conversation", "reply"],
    ["org", "other", "root"],
    ["foreign", "conversation", "root"],
  ] as const;
  let replyCount = 1;
  const reads = [0, 0, 0, 0];
  const snapshot = (messageId: string) => ({
    root: { id: "root", replyCount },
    message: { id: messageId, replyCount: messageId === "root" ? replyCount : 0 },
  });
  const observers = scopes.map(([organizationId, conversationId, messageId], index) => {
    const read = async () => {
      reads[index]++;
      return snapshot(messageId);
    };
    return new QueryObserver(client, {
      queryKey: [...queryKeys.messageTargets(organizationId, conversationId), messageId],
      initialData: snapshot(messageId),
      staleTime: Infinity,
      queryFn: () => read(),
    });
  });
  const unsubscribes = observers.map((observer) => observer.subscribe(() => {}));
  try {
    replyCount++;
    await invalidateSentMessage(client, "org", "conversation", "Another reply", "root");
    expect(observers.map((observer) => observer.getCurrentResult().data?.root.replyCount)).toEqual([
      2, 2, 1, 1,
    ]);
    expect(
      observers.map((observer) => observer.getCurrentResult().data?.message.replyCount),
    ).toEqual([2, 0, 1, 1]);
    expect(reads).toEqual([1, 1, 0, 0]);
  } finally {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    client.clear();
  }
});

test("plain replies refresh only discussion feeds containing that thread", async () => {
  const fixture = mount({
    linked: {
      key: [...context, "related", "task"],
      data: [{ conversationId: "conversation", messageId: "root", threadId: null }],
    },
    replyLink: {
      key: [...context, "related", "project"],
      data: [{ conversationId: "conversation", messageId: "reply", threadId: "root" }],
    },
    unrelated: {
      key: [...context, "related", "other"],
      data: [{ conversationId: "conversation", messageId: "different", threadId: null }],
    },
  });
  try {
    await invalidateSentMessage(fixture.client, "org", "conversation", "Plain reply", "root");
    expect(fixture.reads).toEqual({ linked: 1, replyLink: 1, unrelated: 0 });
  } finally {
    fixture.close();
  }
});

test("task edits refresh the affected project, labels, activity and notifications", async () => {
  const fixture = mount({
    project: { key: queryKeys.project("org", "project"), data: { tasks: [{ entityId: taskId }] } },
    otherProject: { key: queryKeys.project("org", "other"), data: { tasks: [] } },
    catalog: { key: queryKeys.projects("org") },
    activity: { key: [...context, "activity", taskId] },
    otherActivity: { key: [...context, "activity", "other"] },
    labels: {
      key: [...context, "message-pages", "conversation", ["message"]],
      data: [{ links: [{ entityId: taskId }] }],
    },
    otherLabels: {
      key: [...context, "message-pages", "conversation", ["other"]],
      data: [{ links: [{ entityId: "other" }] }],
    },
    notifications: { key: [...context, "notifications"] },
    search: { key: [...context, "search", "term"] },
    messaging: {
      key: queryKeys.conversationList("org", "discussion"),
      data: [{ task: { taskEntityId: taskId, projectEntityId: "project" } }],
    },
    ordinaryMessaging: { key: queryKeys.conversations("org"), data: [{ task: null }] },
  });
  try {
    await fixture.client.invalidateQueries({ queryKey: queryKeys.organization("org") });
    expect(Object.values(fixture.reads).reduce((sum, count) => sum + count, 0)).toBe(11);
    for (const name of Object.keys(fixture.reads)) fixture.reads[name] = 0;
    await invalidateTasksWrite(
      fixture.client,
      {
        action: "updateTask",
        organizationId: "org",
        projectEntityId: "project",
        taskEntityId: taskId,
        title: "New title",
        description: "",
        status: "not_started",
        priority: "none",
        assigneeActorEntityId: null,
        dueDate: null,
      },
      taskId,
    );
    expect(fixture.reads).toEqual({
      project: 1,
      otherProject: 0,
      catalog: 0,
      activity: 1,
      otherActivity: 0,
      labels: 1,
      otherLabels: 0,
      notifications: 1,
      search: 0,
      messaging: 1,
      ordinaryMessaging: 0,
    });
  } finally {
    fixture.close();
  }
});

test("a link refreshes every cached project and task history", async () => {
  const fixture = mount({
    project: { key: queryKeys.project("org", "project"), data: { tasks: [{ entityId: taskId }] } },
    otherProject: { key: queryKeys.project("org", "other"), data: { tasks: [] } },
    catalog: { key: queryKeys.projects("org") },
    activity: { key: [...context, "activity", taskId] },
    otherActivity: { key: [...context, "activity", "other"] },
    notifications: { key: [...context, "notifications"] },
    foreign: { key: queryKeys.project("foreign", "project"), data: { tasks: [] } },
  });
  const target = { organizationId: "org", projectEntityId: "project", taskEntityId: taskId };
  const quiet = { catalog: 0, notifications: 0, foreign: 0 };
  try {
    await invalidateTasksWrite(
      fixture.client,
      { ...target, action: "addTaskLink", relation: "blocked_by", otherTaskEntityId: "other" },
      taskId,
    );
    expect(fixture.reads).toEqual({
      ...quiet,
      project: 1,
      otherProject: 1,
      activity: 1,
      otherActivity: 1,
    });
  } finally {
    fixture.close();
  }
});

test("a blocked search does not block a local mutation or erase stale-only invalidation when it finishes", async () => {
  const client = new QueryClient();
  const initial = Promise.withResolvers<string[]>();
  const key = [...context, "search", "term"];
  let reads = 0;
  const read = () => {
    reads++;
    return initial.promise;
  };
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: () => read(),
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await staleSearches(client, "org");
    expect(client.getQueryState(key)?.fetchStatus).toBe("fetching");
    initial.resolve(["old result"]);
    await advanceTimersAsync(0);
    expect(reads).toBe(1);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryData(key)).toEqual(["old result"]);
  } finally {
    initial.resolve([]);
    unsubscribe();
    client.clear();
  }
});

test("project permission writes refresh child capabilities and references", async () => {
  const fixture = mount({
    project: { key: queryKeys.project("org", "project"), data: { tasks: [{ entityId: taskId }] } },
    catalog: { key: queryKeys.projects("org") },
    labels: {
      key: [...context, "message-pages", "conversation", ["message"]],
      data: [{ links: [{ entityId: taskId }] }],
    },
    otherLabels: {
      key: [...context, "message-pages", "conversation", ["other"]],
      data: [{ links: [{ entityId: "other" }] }],
    },
    related: { key: [...context, "related", taskId] },
    projectRelated: { key: [...context, "related", "project"] },
    otherRelated: { key: [...context, "related", "other"] },
    activity: { key: [...context, "activity", taskId] },
    notifications: { key: [...context, "notifications"] },
  });
  try {
    await invalidateTasksWrite(
      fixture.client,
      {
        action: "revoke",
        organizationId: "org",
        projectEntityId: "project",
        actorEntityId: "actor",
      },
      "project",
    );
    expect(fixture.reads).toEqual({
      project: 1,
      catalog: 1,
      labels: 1,
      otherLabels: 0,
      related: 1,
      projectRelated: 1,
      otherRelated: 0,
      activity: 1,
      notifications: 1,
    });
  } finally {
    fixture.close();
  }
});

test("removing a conversation drops its history and refreshes lists, discussions, task history and alerts", async () => {
  const fixture = mount({
    conversations: { key: queryKeys.conversations("org") },
    managed: { key: queryKeys.managedConversations("org") },
    otherConversation: { key: queryKeys.messages("org", "other") },
    otherPage: { key: [...context, "message-pages", "other", ["other"]] },
    related: { key: [...context, "related", taskId] },
    activity: { key: [...context, "activity", taskId] },
    notifications: { key: [...context, "notifications"] },
    otherWorkspace: { key: queryKeys.conversations("other") },
  });
  const removed = [
    queryKeys.messages("org", "conversation"),
    queryKeys.messages("org", "conversation", "root"),
    [...context, "message-pages", "conversation", ["message"]],
    [...queryKeys.messageTargets("org", "conversation"), "message"],
  ];
  for (const key of removed) fixture.client.setQueryData(key, ["private"]);
  try {
    await invalidateRemovedConversation(fixture.client, "org", "conversation");
    expect(removed.map((key) => fixture.client.getQueryData(key))).toEqual(
      removed.map(() => undefined),
    );
    expect(fixture.reads).toEqual({
      conversations: 1,
      managed: 1,
      otherConversation: 0,
      otherPage: 0,
      related: 1,
      activity: 1,
      notifications: 1,
      otherWorkspace: 0,
    });
  } finally {
    fixture.close();
  }
});

test("a removed conversation leaves the sidebar list before navigation, and other lists stay", () => {
  const client = new QueryClient();
  const list = queryKeys.conversationList("org");
  const other = queryKeys.conversationList("other");
  client.setQueryData(list, [{ id: "conversation" }, { id: "next" }]);
  client.setQueryData(other, [{ id: "conversation" }]);
  forgetRemovedConversation(client, "org", "conversation");
  expect(client.getQueryData(list)).toEqual([{ id: "next" }]);
  expect(client.getQueryData(other)).toEqual([{ id: "conversation" }]);
});

test("adding members refreshes conversations and that conversation's messages, not other messaging data", async () => {
  const fixture = mount({
    conversations: { key: queryKeys.conversations("org") },
    channel: { key: queryKeys.messages("org", "conversation") },
    thread: { key: queryKeys.messages("org", "conversation", "root") },
    otherConversation: { key: queryKeys.messages("org", "other") },
    agents: { key: [...queryKeys.messaging("org"), "available-agents"] },
    otherWorkspace: { key: queryKeys.conversations("other") },
  });
  try {
    await invalidateAddedMembers(fixture.client, "org", "conversation");
    expect(fixture.reads).toEqual({
      conversations: 1,
      channel: 1,
      thread: 1,
      otherConversation: 0,
      agents: 0,
      otherWorkspace: 0,
    });
  } finally {
    fixture.close();
  }
});
