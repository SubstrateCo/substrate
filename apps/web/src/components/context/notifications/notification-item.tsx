import type { MouseEvent } from "react";

import { PendingButton } from "../../feedback/pending-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";
import { AtSign, ListTodo, MessageSquare } from "lucide-react";

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
  const Icon = { assignment: ListTodo, reply: MessageSquare }[item.kind] ?? AtSign;
  const label =
    { assignment: "Assigned to you", reply: "Replied to your thread" }[item.kind] ??
    "Mentioned you";
  return (
    <li
      className={`flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border p-4 text-sm ${item.read ? "bg-card" : "border-ring/20 bg-accent/30"}`}
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground"
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              className="min-w-0 flex-1 basis-40 rounded-sm hover:underline focus-visible:outline-ring"
              href={item.href}
              onClick={onOpen}
            >
              <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
              <span className={`line-clamp-3 wrap-anywhere ${item.read ? "" : "font-semibold"}`}>
                {item.title}
              </span>
            </a>
          </TooltipTrigger>
          <TooltipContent className="wrap-anywhere">{item.title}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="ml-13 flex basis-full flex-wrap items-center gap-3 sm:ml-0 sm:basis-auto">
        <span className="text-xs text-muted-foreground">
          {item.read ? (
            "Read"
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-primary" />
              Unread
            </span>
          )}
        </span>
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
      </div>
    </li>
  );
}
