import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";

import { notificationUnreadOptions } from "./notification-groups";
import { readNotificationsOptions } from "./notification-mutations";
import { expect, test } from "bun:test";

test("a committed group read asks the server for the dot again instead of waiting for a realtime hint", async () => {
  const client = new QueryClient();
  const reads: boolean[] = [];
  let serverUnread = true;
  const dot = new QueryObserver(client, {
    ...notificationUnreadOptions("org"),
    queryFn: async () => {
      reads.push(serverUnread);
      return { unread: serverUnread };
    },
    staleTime: Infinity,
  });
  const unsubscribe = dot.subscribe(() => {});
  try {
    await dot.refetch();
    expect(dot.getCurrentResult().data).toEqual({ unread: true });
    const options = readNotificationsOptions(client, "org", {
      markGroupRead: async () => {
        serverUnread = false;
        return null;
      },
      markAllRead: async () => null,
    });
    await new MutationObserver(client, options).mutate({
      groupKey: "thread:last",
      through: JSON.stringify({ at: "2026-11-10T10:00:00.000001Z", id: "event" }),
    });
    expect(reads).toEqual([true, false]);
    expect(dot.getCurrentResult().data).toEqual({ unread: false });
  } finally {
    unsubscribe();
    client.clear();
  }
});
