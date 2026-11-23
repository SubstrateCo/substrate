import { Link } from "@tanstack/react-router";

import { useState, type MouseEvent, type ReactNode } from "react";

import { RowAction, RowActions } from "../../layout/row-actions";
import { PersonAvatar } from "../../people/person-avatar";
import { Timestamp } from "../../time/timestamp";
import { Button } from "../../ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { actionRow } from "@/components/layout/row-actions";
import { conversationLabel } from "@/lib/messaging/conversations";
import type { RecordLink } from "@/lib/navigation/record-links";
import { cn } from "cn";
import { AtSign, Check, ChevronRight, ListTodo, LockKeyhole, MessageSquare } from "lucide-react";

export type Notification = {
  id: string;
  kind: "assignment" | "mention" | "reply" | "message";
  /** The task or project for assignments. */
  title: string;
  /** Who acted, or null when the server could not name them. */
  actorName: string | null;
  actorImage: string | null;
  /** Where it happened, as the reader sees it. */
  source: { kind: "project" | "channel" | "dm" | "group"; name: string; private?: boolean };
  /** One line of the message, with references the reader cannot open left unnamed. */
  excerpt: string | null;
  link: RecordLink;
  read: boolean;
  createdAt: string;
  count?: number;
  unreadCount?: number;
  otherActorCount?: number;
  mixedKinds?: boolean;
};

const kindIcons = {
  assignment: ListTodo,
  reply: MessageSquare,
  message: MessageSquare,
  mention: AtSign,
};

/** Where it happened: "#launch", a private channel by its bare name, a group, or "a direct message". */
function place(source: Notification["source"]) {
  if (source.kind === "dm") return "a direct message";
  if (source.kind === "project") return source.name;
  return conversationLabel({ ...source, kind: source.kind });
}

/** "Alice replied to a thread in #launch", as plain parts so the names can stand out. */
function sentence(item: Notification) {
  if (item.mixedKinds && item.source.kind !== "project")
    return { verb: "updated a thread in", object: place(item.source) };
  if (item.kind === "assignment") return { verb: "assigned you", object: item.title };
  // A mention on a task comes from a comment.
  if (item.kind === "mention" && item.source.kind === "project")
    return { verb: "mentioned you in a comment on", object: item.title };
  if (item.kind === "mention") return { verb: "mentioned you in", object: place(item.source) };
  if (item.kind === "message")
    return item.source.kind === "dm"
      ? { verb: "sent you", object: "a direct message" }
      : { verb: "sent a message in", object: place(item.source) };
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
  renderEvents,
  showReadAction = true,
}: {
  item: Notification;
  onRead: () => void;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
  renderEvents?: () => ReactNode;
  showReadAction?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = kindIcons[item.kind];
  const actor = item.actorName ?? "Someone";
  const canExpand = !!renderEvents && item.count !== undefined && item.count > 1;
  return (
    <Collapsible asChild open={expanded} onOpenChange={setExpanded}>
      <li>
        <NotificationRowLayout
          unread={!item.read}
          avatar={
            <>
              <PersonAvatar name={actor} image={item.actorImage} />
              <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-surface text-muted-foreground ring-2 ring-surface group-hover/row:bg-row-hover group-hover/row:ring-row-hover">
                <Icon className="size-3" />
              </span>
            </>
          }
          content={
            <>
              <NotificationSummary item={item} actor={actor} onOpen={onOpen} />
              {item.count !== undefined && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  {canExpand ? (
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="disclosure"
                        size="xs"
                        aria-label={`${expanded ? "Hide" : "Show"} ${item.count} events`}
                      >
                        <ChevronRight
                          aria-hidden="true"
                          className={cn("size-3 transition-transform", expanded && "rotate-90")}
                        />
                        {item.count} events
                      </Button>
                    </CollapsibleTrigger>
                  ) : (
                    <span>
                      {item.count} event{item.count === 1 ? "" : "s"}
                    </span>
                  )}
                  {!!item.unreadCount && <span>{item.unreadCount} unread</span>}
                </div>
              )}
            </>
          }
          meta={<Timestamp value={item.createdAt} format="relative" />}
          action={
            !item.read &&
            showReadAction && (
              <RowActions label="Notification actions" className="-mt-1">
                <RowAction label="Mark as read" onClick={onRead}>
                  <Check aria-hidden="true" />
                </RowAction>
              </RowActions>
            )
          }
        />
        {canExpand && (
          <CollapsibleContent>
            <div className="mt-1 mb-3 ml-12 border-l pl-3">{expanded && renderEvents()}</div>
          </CollapsibleContent>
        )}
      </li>
    </Collapsible>
  );
}

function NotificationRowLayout({
  unread,
  avatar,
  content,
  meta,
  action,
}: {
  unread?: boolean;
  avatar: ReactNode;
  content: ReactNode;
  meta: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        actionRow,
        "relative flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-row-hover has-[a:focus-visible]:bg-row-hover",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-2 size-1.5 shrink-0 rounded-full",
          unread ? "bg-primary" : "bg-transparent",
        )}
      />
      <span aria-hidden="true" className="relative mt-0.5 shrink-0">
        {avatar}
      </span>
      <div className="min-w-0 flex-1">{content}</div>
      <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">{meta}</span>
      <div className="w-8 shrink-0">{action}</div>
    </div>
  );
}

export function NotificationRowsLoading({ label }: { label: string }) {
  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <ul aria-hidden="true" className="flex flex-col gap-px">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <NotificationRowLayout
              avatar={<SkeletonText width="1.5rem" className="h-6 rounded-full" />}
              content={
                <div className="text-sm">
                  <SkeletonText width="70%" />
                  <div className="mt-0.5">
                    <SkeletonText width="50%" />
                  </div>
                </div>
              }
              meta={<SkeletonText width="2rem" />}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotificationSummary({
  item,
  actor,
  onOpen,
}: {
  item: Notification;
  actor: string;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const others = item.otherActorCount;
  const actors = others ? `${actor} and ${others} ${others === 1 ? "other" : "others"}` : actor;
  const { verb, object } = sentence(item);
  const detail = item.source.kind === "project" ? item.source.name : item.excerpt;
  const nameWeight = item.read ? "font-medium" : "font-semibold";
  return (
    <>
      <p className="flex min-w-0 items-baseline gap-2 text-sm">
        <Link
          {...item.link}
          // One name for the row; a visually hidden span would add a stray space before ", unread".
          aria-label={`${actors} ${verb} ${object}${item.read ? "" : ", unread"}`}
          onClick={onOpen}
          className="min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={nameWeight}>{actors}</span>{" "}
          <span className="text-muted-foreground">{verb}</span>{" "}
          <span className={nameWeight}>
            <LockedPlace item={item} object={object} />
          </span>
        </Link>
      </p>
      {detail && (
        <p
          className={cn(
            "mt-0.5 line-clamp-2 text-sm wrap-anywhere",
            item.read ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {detail}
        </p>
      )}
    </>
  );
}
