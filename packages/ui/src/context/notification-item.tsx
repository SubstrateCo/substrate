import type { MouseEvent } from "react";
import { PendingButton } from "../feedback/pending-button";

export type Notification = { id: string; title: string; href: string; kind: string; read: boolean };

export function NotificationItem({
  item,
  pending,
  disabled,
  onRead,
  onOpen,
}: {
  item: Notification;
  pending: boolean;
  disabled: boolean;
  onRead: () => void;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded border p-2 text-sm">
      <a className="underline" href={item.href} onClick={onOpen}>
        {item.kind === "assignment" ? "Assigned to you: " : ""}
        {item.title}
      </a>
      <span>{item.read ? "Read" : "Unread"}</span>
      {!item.read && (
        <PendingButton
          size="xs"
          variant="outline"
          pending={pending}
          disabled={disabled}
          pendingLabel="Marking as read."
          onClick={onRead}
        >
          Mark as read
        </PendingButton>
      )}
    </li>
  );
}
