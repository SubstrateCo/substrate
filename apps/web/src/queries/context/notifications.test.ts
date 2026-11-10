import { QueryClient, QueryObserver } from "@tanstack/react-query";

import {
  markNotificationsRead,
  notificationPageOptions,
  notificationsOptions,
} from "./notifications";
import { expect, test } from "bun:test";

type Notification = Awaited<
  ReturnType<NonNullable<ReturnType<typeof notificationsOptions>["queryFn"]>>
>[number];

test("read updates reach every cached notification page without crossing workspaces", () => {
  const client = new QueryClient();
  const keys = [
    notificationPageOptions("org", "all").queryKey,
    notificationPageOptions("org", "unread", "cursor").queryKey,
    notificationPageOptions("other", "all").queryKey,
  ];
  // SAFETY: cache updates only use id and readAt from each notification.
  const item = { id: "notice", readAt: null } as Notification;
  for (const key of keys) client.setQueryData(key, { items: [item], nextCursor: "next" });
  markNotificationsRead(client, "org", "notice");
  const pages = keys.map((key) =>
    client.getQueryData<{ items: Notification[]; nextCursor: string }>(key)!,
  );
  expect(pages[0]!.items[0]!.readAt).not.toBeNull();
  expect(pages[1]!.items[0]!.readAt).toBe(pages[0]!.items[0]!.readAt);
  expect(pages[2]!.items[0]!.readAt).toBeNull();
  expect(pages[0]!.nextCursor).toBe("next");
  client.clear();
});

for (const target of ["one", "all"] as const) {
  test(`marking ${target} read updates the list at once and leaves the refresh to the hint`, () => {
    const client = new QueryClient();
    const earlier = "2026-01-01T00:00:00.000Z";
    // SAFETY: markNotificationsRead reads and writes only id and readAt.
    const rows = [
      { id: "a", readAt: null },
      { id: "b", readAt: null },
      { id: "c", readAt: earlier },
    ] as Notification[];
    const refresh = Promise.withResolvers<Notification[]>();
    let reads = 0;
    const observer = new QueryObserver(client, {
      ...notificationsOptions("org"),
      initialData: rows,
      staleTime: Infinity,
      queryFn: () => {
        reads++;
        return refresh.promise;
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      markNotificationsRead(client, "org", target === "one" ? "a" : null);
      const data = observer.getCurrentResult().data!;
      expect(data[0]!.readAt).not.toBeNull();
      expect(data[1]!.readAt === null).toBe(target === "one");
      expect(data[2]!.readAt).toBe(earlier);
      // The reader's notifications hint refreshes the list; the mutation sends no second read.
      expect(reads).toBe(0);
      expect(observer.getCurrentResult().fetchStatus).toBe("idle");
    } finally {
      refresh.resolve(rows);
      unsubscribe();
      client.clear();
    }
  });
}
