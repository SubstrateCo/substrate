import { QueryClient } from "@tanstack/react-query";

import { invalidateWorkLabels } from "./context/mutations";
import { queryKeys } from "./keys";
import { domainTargets, invalidateTargets } from "./targets";
import { expect, test } from "bun:test";

test("multiple task IDs refresh their linked messages and discussions, not other work", async () => {
  const client = new QueryClient();
  const linked = queryKeys.messagePage("org", "conversation", ["linked"]);
  const other = queryKeys.messagePage("org", "conversation", ["other"]);
  const discussion = queryKeys.conversationList("org", "discussion");
  const privateConversation = queryKeys.conversationList("org", "channel");
  client.setQueryData(linked, [{ links: [{ entityId: "second", projectEntityId: "project" }] }]);
  client.setQueryData(other, [{ links: [{ entityId: "other", projectEntityId: "project" }] }]);
  client.setQueryData(discussion, [
    { task: { taskEntityId: "first", projectEntityId: "project" } },
  ]);
  client.setQueryData(privateConversation, [
    { task: { taskEntityId: "other", projectEntityId: "project" } },
  ]);

  await invalidateTargets(
    client,
    domainTargets("tasks", "org", undefined, undefined, {
      projectId: "project",
      taskIds: ["first", "second"],
    }),
  );

  expect(client.getQueryState(linked)?.isInvalidated).toBe(true);
  expect(client.getQueryState(discussion)?.isInvalidated).toBe(true);
  expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  expect(client.getQueryState(privateConversation)?.isInvalidated).toBe(false);
  client.clear();
});

test("a calendar's context hint refreshes that organization's calendars, events, and meetings", async () => {
  const client = new QueryClient();
  const refreshed = [
    queryKeys.calendarSettings("org"),
    [...queryKeys.calendarEvents("org"), { from: "2026-11-21", until: "2026-11-30" }],
    queryKeys.calendarEvent("org", "meeting"),
    [...queryKeys.calendarEvents("org"), "contact", "contact"],
  ];
  const other = queryKeys.calendarSettings("other");
  for (const key of [...refreshed, other]) client.setQueryData(key, []);

  await invalidateTargets(client, domainTargets("context", "org"));

  for (const key of refreshed) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  client.clear();
});

test("work label refreshes match a named entity, not its project unless the page links to it", async () => {
  const client = new QueryClient();
  const task = queryKeys.messagePage("org", "conversation", ["task"]);
  const other = queryKeys.messagePage("org", "conversation", ["other"]);
  const foreign = queryKeys.messagePage("foreign", "conversation", ["task"]);
  client.setQueryData(task, [{ links: [{ entityId: "task", projectEntityId: "project" }] }]);
  client.setQueryData(other, [{ links: [{ entityId: "other", projectEntityId: "project" }] }]);
  client.setQueryData(foreign, [{ links: [{ entityId: "task", projectEntityId: "project" }] }]);

  await invalidateWorkLabels(client, "org", ["project", "task"]);

  expect(client.getQueryState(task)?.isInvalidated).toBe(true);
  expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
  client.clear();
});

test("a task change refreshes notification groups only in its workspace", async () => {
  const client = new QueryClient();
  const groups = queryKeys.notificationGroups("org", "all");
  const other = queryKeys.notificationGroups("other", "all");
  client.setQueryData(groups, {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [undefined],
  });
  client.setQueryData(other, { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] });
  await invalidateTargets(
    client,
    domainTargets("tasks", "org", undefined, undefined, { projectId: "project", taskIds: ["t"] }),
  );
  expect(client.getQueryState(groups)?.isInvalidated).toBe(true);
  expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  client.clear();
});
