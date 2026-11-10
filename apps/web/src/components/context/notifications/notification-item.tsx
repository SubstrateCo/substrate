import type { MouseEvent } from "react";

import { Avatar, AvatarFallback } from "../../ui/avatar";
import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { formatFullTimestamp, formatRelativeTime } from "@/lib/format/date";
import { conversationLabel } from "@/lib/messaging/conversations";
import { initials } from "@/lib/people/initials";
import { cn } from "cn";
import { AtSign, Check, ListTodo, LockKeyhole, MessageSquare } from "lucide-react";

export type Notification = {
  id: string;
  kind: "assignment" | "mention" | "reply";
  /** The task or project for assignments. */
  title: string;
  /** Who acted, or null when the server could not name them. */
  actorName: string | null;
  /** Where it happened, as the reader sees it. */
  source: { kind: "project" | "channel" | "dm" | "group"; name: string; private?: boolean };
  /** One line of the message, with references the reader cannot open left unnamed. */
  excerpt: string | null;
  href: string;
  read: boolean;
  createdAt: string;
};

const kindIcons = { assignment: ListTodo, reply: MessageSquare, mention: AtSign };

/** Where it happened: "#launch", a private channel by its bare name, a group, or "a direct message". */
function place(source: Notification["source"]) {
  if (source.kind === "dm") return "a direct message";
  if (source.kind === "project") return source.name;
  return conversationLabel({ ...source, kind: source.kind });
}

/** "Alice replied to a thread in #launch", as plain parts so the names can stand out. */
function sentence(item: Notification) {
  if (item.kind === "assignment") return { verb: "assigned you", object: item.title };
  if (item.kind === "mention") return { verb: "mentioned you in", object: place(item.source) };
  return { verb: "replied to a thread in", object: place(item.source) };
}

/** A lock before the name of a private channel, which has no "#". */
function LockedPlace({ item, object }: { item: Notification; object: string }) {
  if (item.kind === "assignment" || item.source.kind !== "channel" || !item.source.private)
    return object;
  return (
    <>
      <LockKeyhole aria-hidden="true" className="mr-1 inline size-3 -translate-y-px" />
      {object}
    </>
  );
}

export function NotificationItem({
  item,
  onRead,
  onOpen,
}: {
  item: Notification;
  onRead: () => void;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const Icon = kindIcons[item.kind];
  const actor = item.actorName ?? "Someone";
  const { verb, object } = sentence(item);
  const detail = item.kind === "assignment" ? item.source.name : item.excerpt;
  return (
    <li className="group/notice relative flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-row-hover has-[a:focus-visible]:bg-row-hover">
      <span
        aria-hidden="true"
        className={cn(
          "mt-3.5 size-1.5 shrink-0 rounded-full",
          item.read ? "bg-transparent" : "bg-primary",
        )}
      />
      <span aria-hidden="true" className="relative mt-0.5 shrink-0">
        <Avatar variant="user" className="size-8">
          <AvatarFallback>{initials(actor)}</AvatarFallback>
        </Avatar>
        <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-surface text-muted-foreground ring-2 ring-surface group-hover/notice:bg-row-hover group-hover/notice:ring-row-hover">
          <Icon className="size-3" />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-baseline gap-2 text-sm">
          {/* The link covers the whole row; the read button sits above it. */}
          <a
            href={item.href}
            // One name for the row; a visually hidden span would add a stray space before ", unread".
            aria-label={`${actor} ${verb} ${object}${item.read ? "" : ", unread"}`}
            onClick={onOpen}
            className="min-w-0 flex-1 truncate outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            <span className={cn(item.read ? "font-medium" : "font-semibold")}>{actor}</span>{" "}
            <span className="text-muted-foreground">{verb}</span>{" "}
            <span className={cn(item.read ? "font-medium" : "font-semibold")}>
              <LockedPlace item={item} object={object} />
            </span>
          </a>
          <time
            dateTime={item.createdAt}
            title={formatFullTimestamp(item.createdAt)}
            className={cn(
              "shrink-0 text-xs text-muted-foreground tabular-nums",
              // The read button takes this place on hover and focus.
              !item.read &&
                "group-hover/notice:invisible group-has-[button:focus-visible]/notice:invisible",
            )}
          >
            {formatRelativeTime(item.createdAt)}
          </time>
        </p>
        {detail && (
          <p
            className={cn(
              "mt-0.5 line-clamp-2 text-sm wrap-anywhere",
              item.read ? "text-muted-foreground" : "text-foreground/80",
            )}
          >
            {detail}
          </p>
        )}
      </div>
      {!item.read && (
        // Shown on row hover and on keyboard focus, above the row link.
        <span className="absolute top-2 right-2 z-10 opacity-0 group-hover/notice:opacity-100 has-focus-visible:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Mark as read" onClick={onRead}>
                <Check aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Mark as read</TooltipContent>
          </Tooltip>
        </span>
      )}
    </li>
  );
}
