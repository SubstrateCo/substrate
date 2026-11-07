import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { markAllRead, markRead } from "@/api/context/notifications";
import { NotificationList as NotificationListView } from "@/components/context/notifications/notification-list-view";
import { messageHref, workHref } from "@/lib/navigation/record-links";
import { notificationsOptions } from "@/queries/context/notifications";
import { queryKeys } from "@/queries/keys";

export function NotificationList({
  organizationId,
  onClose,
}: {
  organizationId: string;
  onClose?: () => void;
}) {
  const items = useQuery(notificationsOptions(organizationId));
  const client = useQueryClient();
  const read = useMutation({
    mutationFn: (id: string | null) =>
      id ? markRead({ data: { organizationId, id } }) : markAllRead({ data: { organizationId } }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.context(organizationId) }),
  });
  return (
    <NotificationListView
      items={(items.data ?? []).map((item) => ({
        ...item,
        read: !!item.readAt,
        href: item.conversationId
          ? messageHref(organizationId, item.conversationId, item.messageId!)
          : workHref(organizationId, item.projectEntityId!, item.entityId!),
      }))}
      loading={items.isPending}
      error={items.error}
      actionError={read.error}
      pendingId={read.isPending ? (read.variables ?? "all") : undefined}
      onRetry={() => void items.refetch()}
      onRead={(id) => read.mutate(id)}
      onReadAll={() => read.mutate(null)}
      onOpen={(item, event) => {
        event.preventDefault();
        if (read.isPending) return;
        read.mutate(item.id, { onSuccess: () => window.location.assign(item.href) });
      }}
      onClose={onClose}
    />
  );
}
