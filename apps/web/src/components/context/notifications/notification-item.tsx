import type { MouseEvent } from "react";

import { Button } from "../../ui/button";
import { Spinner } from "../../ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";
import { AtSign, Check, ListTodo, MessageSquare } from "lucide-react";

export type Notification = {
  id: string;
  title: string;
  href: string;
  kind: string;
  read: boolean;
  createdAt: string;
};

export function NotificationItem({
  item,
  pending,
  disabled,
  showUnread,
  onRead,
  onOpen,
}: {
  item: Notification;
  pending: boolean;
  disabled: boolean;
  showUnread: boolean;
  onRead: () => void;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const Icon = { assignment: ListTodo, reply: MessageSquare }[item.kind] ?? AtSign;
  const label =
    { assignment: "Assigned to you", reply: "Replied to your thread" }[item.kind] ??
    "Mentioned you";
  const createdAt = new Date(item.createdAt);
  return (
    <li
      className={`flex h-16 items-center gap-3 px-4 text-sm transition-colors hover:bg-muted/40 ${item.read ? "" : "bg-primary/3"}`}
    >
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${item.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              className="min-w-0 flex-1 rounded-sm hover:underline focus-visible:outline-ring"
              href={item.href}
              onClick={onOpen}
            >
              <span className={`block truncate ${item.read ? "" : "font-semibold"}`}>
                {item.title}
              </span>
              <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">{label}</span>
                <span aria-hidden="true">·</span>
                <time
                  dateTime={item.createdAt}
                  title={createdAt.toLocaleString()}
                  className="truncate"
                >
                  {createdAt.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  <span aria-hidden="true"> · </span>
                  {createdAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </time>
              </span>
            </a>
          </TooltipTrigger>
          <TooltipContent className="wrap-anywhere">{item.title}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="flex shrink-0 items-center gap-3">
        {(item.read || showUnread) && (
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
        )}
        {!item.read && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Mark as read"
                  aria-busy={pending}
                  disabled={disabled || pending}
                  onClick={onRead}
                >
                  {pending ? (
                    <Spinner aria-hidden="true" role="presentation" />
                  ) : (
                    <Check aria-hidden="true" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mark as read</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </li>
  );
}
