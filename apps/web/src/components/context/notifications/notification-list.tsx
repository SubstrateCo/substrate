import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { markAllRead, markRead } from "@/api/context/notifications";
import { NotificationList as NotificationListView } from "@/components/context/notifications/notification-list-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { messageHref, workHref } from "@/lib/navigation/record-links";
import { markNotificationsRead, notificationsOptions } from "@/queries/context/notifications";
import { toast } from "sonner";

export function NotificationList({
  organizationId,
  onClose,
}: {
  organizationId: string;
  onClose?: () => void;
}) {
  const items = useQuery(notificationsOptions(organizationId));
  const client = useQueryClient();
  const navigate = useNavigate();
  const read = useMutation({
    mutationFn: (id: string | null) =>
      id ? markRead({ data: { organizationId, id } }) : markAllRead({ data: { organizationId } }),
    onSuccess: (_, id) => markNotificationsRead(client, organizationId, id),
    onError: (error) =>
      toast.error(actionErrorMessage(error, "Couldn't update notifications. Try again.")),
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
      pendingId={read.isPending ? (read.variables ?? "all") : undefined}
      onRetry={() => void items.refetch()}
      onRead={(id) => read.mutate(id)}
      onReadAll={() => read.mutate(null)}
      onOpen={(item, event) => {
        event.preventDefault();
        if (read.isPending) return;
        const open = () => {
          onClose?.();
          void navigate({ to: item.href });
        };
        if (item.read) open();
        else read.mutate(item.id, { onSuccess: open });
      }}
      onClose={onClose}
    />
  );
}
