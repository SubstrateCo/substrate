import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NotificationList as NotificationListView } from "@startup-os/ui/context/notification-list";
import { notificationsOptions } from "@/queries/context/options";
import { queryKeys } from "@/queries/keys";
import { markRead } from "@/api/context";
import { messageHref, workHref } from "@/lib/context-links";

export function NotificationList({
  organizationId,
  onClose,
}: {
  organizationId: string;
  onClose: () => void;
}) {
  const items = useQuery(notificationsOptions(organizationId));
  const client = useQueryClient();
  const read = useMutation({
    mutationFn: (id: string) => markRead({ data: { organizationId, id } }),
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
      pendingId={read.isPending ? read.variables : undefined}
      onRetry={() => void items.refetch()}
      onRead={(id) => read.mutate(id)}
      onOpen={(item, event) => {
        event.preventDefault();
        if (read.isPending) return;
        read.mutate(item.id, { onSuccess: () => window.location.assign(item.href) });
      }}
      onClose={onClose}
    />
  );
}
