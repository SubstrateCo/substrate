import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { markNotificationsRead, notificationsOptions } from "./notifications";
import { expect, test } from "bun:test";

type Notification = Awaited<
  ReturnType<NonNullable<ReturnType<typeof notificationsOptions>["queryFn"]>>
>[number];

for (const target of ["one", "all"] as const) {
  test(`marking ${target} read updates the list at once without waiting for its refresh`, () => {
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
      // The server snapshot still refreshes in the background.
      expect(reads).toBe(1);
      expect(observer.getCurrentResult().fetchStatus).toBe("fetching");
    } finally {
      refresh.resolve(rows);
      unsubscribe();
      client.clear();
    }
  });
}
