import { QueryClient } from "@tanstack/react-query";

import {
  markNotificationGroupsRead,
  notificationGroupEventsOptions,
  notificationGroupsOptions,
  notificationUnreadOptions,
  type NotificationGroup,
  type NotificationEvent,
} from "./notification-groups";
import { expect, test } from "bun:test";

const cursor = (at: string, id = "00000000-0000-4000-8000-000000000001") =>
  JSON.stringify({ at, id });
const earlier = cursor("2026-11-10T10:00:00.000001Z");
const later = cursor("2026-11-10T10:00:00.000002Z");
function group(groupKey: string, newestCursor = earlier): NotificationGroup {
  return {
    id: "event",
    kind: "reply",
    readAt: null,
    createdAt: "2026-11-10T10:00:00.000Z",
    actorName: "Maya",
    actorImage: null,
    title: "New thread reply",
    entityId: null,
    projectEntityId: null,
    conversationId: "conversation",
    messageId: "message",
    threadId: "root",
    source: { kind: "channel", name: "Launch", private: true },
    excerpt: "Ready to go",
    groupKey,
    count: 5,
    unreadCount: 3,
    otherActorCount: 1,
    mixedKinds: false,
    newestCursor,
  };
}

test("group read updates all loaded caches, removes unread groups, and leaves the global dot alone", () => {
  const client = new QueryClient();
  const mine = group("thread:mine");
  const other = group("thread:other");
  const data = {
    pages: [
      { items: [mine], nextCursor: "older" },
      { items: [other], nextCursor: null },
    ],
    pageParams: [undefined, "older"],
  };
  const all = notificationGroupsOptions("org", "all").queryKey;
  const unread = notificationGroupsOptions("org", "unread").queryKey;
  const workspace = notificationGroupsOptions("other", "all").queryKey;
  for (const key of [all, unread, workspace]) client.setQueryData(key, data);
  client.setQueryData(notificationUnreadOptions("org").queryKey, { unread: true });
  const event: NotificationEvent = { ...mine, eventCursor: earlier };
  const events = notificationGroupEventsOptions("org", mine.groupKey).queryKey;
  client.setQueryData(events, {
    pages: [{ items: [event, { ...event, id: "new", eventCursor: later }], nextCursor: null }],
    pageParams: [undefined],
  });
  markNotificationGroupsRead(client, "org", { groupKey: mine.groupKey, through: earlier });
  expect(client.getQueryData(all)!.pages.map((page) => page.items[0]!.unreadCount)).toEqual([0, 3]);
  expect(client.getQueryData(unread)!.pages.map((page) => page.items.length)).toEqual([0, 1]);
  expect(client.getQueryData(all)!.pageParams).toEqual(data.pageParams);
  expect(client.getQueryData(workspace)!.pages[0]!.items[0]!.unreadCount).toBe(3);
  expect(client.getQueryData(events)!.pages[0]!.items.map((item) => !!item.readAt)).toEqual([
    true,
    false,
  ]);
  expect(client.getQueryData(notificationUnreadOptions("org").queryKey)).toEqual({ unread: true });
  client.clear();
});

test("an older read cutoff does not clear a group that has received a newer event", () => {
  const client = new QueryClient();
  const key = notificationGroupsOptions("org", "unread").queryKey;
  client.setQueryData(key, {
    pages: [{ items: [group("thread:mine", later)], nextCursor: null }],
    pageParams: [undefined],
  });
  markNotificationGroupsRead(client, "org", { groupKey: "thread:mine", through: earlier });
  expect(client.getQueryData(key)!.pages[0]!.items[0]!.unreadCount).toBe(3);
  markNotificationGroupsRead(client, "org", null);
  expect(client.getQueryData(key)!.pages[0]!.items).toEqual([]);
  expect(client.getQueryData(notificationUnreadOptions("org").queryKey)).toEqual({ unread: false });
  client.clear();
});
