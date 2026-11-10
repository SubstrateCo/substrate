import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState } from "react";

import { markAllRead, markRead } from "@/api/context/notifications";
import { NotificationList as NotificationListView } from "@/components/context/notifications/notification-list-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { messageHref, workHref } from "@/lib/navigation/record-links";
import {
  markNotificationsRead,
  notificationFeedOptions,
  notificationsOptions,
} from "@/queries/context/notifications";
import { toast } from "sonner";

export function NotificationList({
  organizationId,
  onClose,
}: {
  organizationId: string;
  onClose?: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const feed = useInfiniteQuery(notificationFeedOptions(organizationId, filter));
  const client = useQueryClient();
  const navigate = useNavigate();
  // Read state changes at once. A failed write reloads the feed, so the row shows unread again.
  const read = useMutation({
    mutationFn: (id: string | null) =>
      id ? markRead({ data: { organizationId, id } }) : markAllRead({ data: { organizationId } }),
    onMutate: (id) => markNotificationsRead(client, organizationId, id),
    onError: (error) => {
      toast.error(actionErrorMessage(error, "Couldn't mark notifications as read. Try again."));
      void client.invalidateQueries({ queryKey: notificationsOptions(organizationId).queryKey });
    },
  });
  const items = (feed.data?.pages ?? []).flatMap((page) =>
    page.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      actorName: item.actorName,
      source: item.source,
      excerpt: item.excerpt,
      createdAt: item.createdAt,
      read: !!item.readAt,
      href: item.conversationId
        ? messageHref(organizationId, item.conversationId, item.messageId!)
        : workHref(organizationId, item.projectEntityId!, item.entityId!),
    })),
  );
  return (
    <NotificationListView
      items={items}
      loading={feed.isPending}
      error={feed.error}
      filter={filter}
      onFilter={setFilter}
      hasMore={feed.hasNextPage}
      loadingMore={feed.isFetchingNextPage}
      onMore={() => {
        if (!feed.isFetching) void feed.fetchNextPage();
      }}
      readingAll={read.isPending && read.variables === null}
      onRetry={() => void (feed.isFetchNextPageError ? feed.fetchNextPage() : feed.refetch())}
      onRead={(id) => read.mutate(id)}
      onReadAll={() => read.mutate(null)}
      onOpen={(item, event) => {
        // Opening never waits for read bookkeeping.
        if (!item.read) read.mutate(item.id);
        // Modified clicks keep the link's own behavior.
        const modified = [event.metaKey, event.ctrlKey, event.shiftKey, event.altKey].some(Boolean);
        if (event.button !== 0 || modified) return;
        event.preventDefault();
        onClose?.();
        void navigate({ to: item.href });
      }}
      onClose={onClose}
    />
  );
}
