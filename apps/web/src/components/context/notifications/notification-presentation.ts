import type { Notification } from "./notification-item";
import { messageLink, workLink } from "@/lib/navigation/record-links";
import type { NotificationEvent, NotificationGroup } from "@/queries/context/notification-groups";

/** Whether a notification shows. Without the Tasks app, task and project work is hidden. */
export function showsNotification(
  item: Pick<NotificationEvent | NotificationGroup, "projectEntityId" | "kind">,
  tasksEnabled: boolean,
) {
  return tasksEnabled || (!item.projectEntityId && item.kind !== "assignment");
}

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
