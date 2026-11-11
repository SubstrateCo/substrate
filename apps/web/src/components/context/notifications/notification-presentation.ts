import type { Notification } from "./notification-item";
import { messageLink, workLink } from "@/lib/navigation/record-links";
import type { NotificationEvent, NotificationGroup } from "@/queries/context/notification-groups";

export function notificationPresentation(
  organizationId: string,
  item: NotificationEvent | NotificationGroup,
): Notification {
  return {
    ...item,
    read: "unreadCount" in item ? item.unreadCount === 0 : !!item.readAt,
    link: item.conversationId
      ? messageLink(organizationId, item.conversationId, item.messageId!)
      : workLink(organizationId, item.projectEntityId!, item.entityId!),
  };
}
