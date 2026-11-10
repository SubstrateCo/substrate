import type { Notification } from "./notification-item";
import { messageHref, workHref } from "@/lib/navigation/record-links";
import type { NotificationEvent, NotificationGroup } from "@/queries/context/notification-groups";

export function notificationPresentation(
  organizationId: string,
  item: NotificationEvent | NotificationGroup,
): Notification {
  return {
    ...item,
    read: "unreadCount" in item ? item.unreadCount === 0 : !!item.readAt,
    href: item.conversationId
      ? messageHref(organizationId, item.conversationId, item.messageId!)
      : workHref(organizationId, item.projectEntityId!, item.entityId!),
  };
}
