import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { getNotifications, getNotificationPage } from "@/api/context/notifications";

export const notificationsOptions = (organizationId: string) =>
  queryOptions({
    queryKey: [...queryKeys.context(organizationId), "notifications"],
    queryFn: ({ signal }) => getNotifications({ data: { organizationId }, signal }),
    retry: false,
  });

export const notificationPageOptions = (
  organizationId: string,
  filter: "all" | "unread",
  after?: string,
  limit = 20,
) =>
  queryOptions({
    queryKey: [...notificationsOptions(organizationId).queryKey, "page", filter, after, limit],
    queryFn: ({ signal }) =>
      getNotificationPage({ data: { organizationId, filter, after, limit }, signal }),
    retry: false,
  });

/** The notification feed: newest first, older pages on request. */
export const notificationFeedOptions = (organizationId: string, filter: "all" | "unread") =>
  infiniteQueryOptions({
    queryKey: [...notificationsOptions(organizationId).queryKey, "feed", filter],
    // SAFETY: The first page has no cursor; later pages use the server's cursor.
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      getNotificationPage({
        data: { organizationId, filter, after: pageParam, limit: 20 },
        signal,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });

// Shows a read state at once. The server sends the reader a notifications hint after the write,
// and that hint refreshes every notifications query, so this does not refetch them again.
export function markNotificationsRead(
  client: QueryClient,
  organizationId: string,
  id: string | null,
) {
  const { queryKey } = notificationsOptions(organizationId);
  const readAt = new Date().toISOString();
  client.setQueryData(queryKey, (items) =>
    items?.map((item) =>
      id === null || item.id === id ? { ...item, readAt: item.readAt ?? readAt } : item,
    ),
  );
  type Page = Awaited<ReturnType<typeof getNotificationPage>>;
  const markPage = (page: Page): Page => ({
    ...page,
    items: page.items.map((item) =>
      id === null || item.id === id ? { ...item, readAt: item.readAt ?? readAt } : item,
    ),
  });
  client.setQueriesData<Page>(
    { queryKey: [...queryKey, "page"] },
    (page) => page && markPage(page),
  );
  client.setQueriesData<InfiniteData<Page>>(
    { queryKey: [...queryKey, "feed"] },
    (feed) => feed && { ...feed, pages: feed.pages.map(markPage) },
  );
}
