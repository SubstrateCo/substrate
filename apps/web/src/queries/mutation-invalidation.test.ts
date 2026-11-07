import { QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query";

import { staleSearches } from "./context/mutations";
import { queryKeys } from "./keys";
import { invalidateSentMessage } from "./messaging/mutations";
import { invalidateTasksWrite } from "./tasks/mutations";
import { expect, test } from "bun:test";

const taskId = "00000000-0000-4000-8000-000000000001";
const context = queryKeys.context("org");

function mount(entries: Record<string, { key: QueryKey; data?: unknown }>) {
  const client = new QueryClient();
  const reads: Record<string, number> = {};
  const unsubscribes = Object.entries(entries).map(([name, { key, data = [] }]) => {
    reads[name] = 0;
    return new QueryObserver(client, {
      queryKey: key,
      initialData: data,
      staleTime: Infinity,
      queryFn: async () => {
        reads[name]++;
        return data;
      },
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
    member: { key: queryKeys.activeMember("org") },
    otherWorkspace: { key: queryKeys.messages("other", "conversation") },
  });
  try {
    // Measure the replaced organization-wide policy against the same mounted fixture.
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
      conversations: 1,
      channel: 1,
      thread: 1,
      history: 1,
      otherConversation: 0,
      page: 1,
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

test("task edits refresh the affected project, labels, activity and notifications only; comments refresh only their feed", async () => {
  const fixture = mount({
    project: { key: queryKeys.project("org", "project"), data: { tasks: [{ entityId: taskId }] } },
    otherProject: { key: queryKeys.project("org", "other"), data: { tasks: [] } },
    catalog: { key: queryKeys.projects("org") },
    comments: { key: queryKeys.taskComments("org", "project", taskId) },
    otherComments: { key: queryKeys.taskComments("org", "project", "other") },
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
    messaging: { key: queryKeys.conversations("org") },
  });
  try {
    await fixture.client.invalidateQueries({ queryKey: queryKeys.organization("org") });
    expect(Object.values(fixture.reads).reduce((sum, count) => sum + count, 0)).toBe(12);
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
      comments: 0,
      otherComments: 0,
      activity: 1,
      otherActivity: 0,
      labels: 1,
      otherLabels: 0,
      notifications: 1,
      search: 0,
      messaging: 0,
    });
    for (const name of Object.keys(fixture.reads)) fixture.reads[name] = 0;
    await invalidateTasksWrite(
      fixture.client,
      {
        action: "comment",
        organizationId: "org",
        projectEntityId: "project",
        taskEntityId: taskId,
        body: "A comment",
      },
      taskId,
    );
    expect(fixture.reads.comments).toBe(1);
    expect(Object.values(fixture.reads).reduce((sum, count) => sum + count, 0)).toBe(1);
  } finally {
    fixture.close();
  }
});

test("a blocked search does not block a local mutation or erase stale-only invalidation when it finishes", async () => {
  const client = new QueryClient();
  const initial = Promise.withResolvers<string[]>();
  const key = [...context, "search", "term"];
  let reads = 0;
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: () => {
      reads++;
      return initial.promise;
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await staleSearches(client, "org");
    expect(client.getQueryState(key)?.fetchStatus).toBe("fetching");
    initial.resolve(["old result"]);
    await Bun.sleep(0);
    expect(reads).toBe(1);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryData(key)).toEqual(["old result"]);
  } finally {
    initial.resolve([]);
    unsubscribe();
    client.clear();
  }
});

test("project permission writes refresh child capabilities and comments without touching another project", async () => {
  const fixture = mount({
    project: { key: queryKeys.project("org", "project"), data: { tasks: [{ entityId: taskId }] } },
    catalog: { key: queryKeys.projects("org") },
    comments: { key: queryKeys.taskComments("org", "project", taskId) },
    otherComments: { key: queryKeys.taskComments("org", "other", "other") },
    labels: { key: [...context, "message", "message"], data: [{ entityId: taskId }] },
    otherLabels: { key: [...context, "message", "other"], data: [{ entityId: "other" }] },
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
      comments: 1,
      otherComments: 0,
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
