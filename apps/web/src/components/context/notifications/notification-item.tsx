import { useState, type MouseEvent, type ReactNode } from "react";

import { RowAction, RowActions } from "../../layout/row-actions";
import { PersonAvatar } from "../../people/person-avatar";
import { Timestamp } from "../../time/timestamp";
import { Button } from "../../ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { conversationLabel } from "@/lib/messaging/conversations";
import { cn } from "cn";
import { AtSign, Check, ChevronRight, ListTodo, LockKeyhole, MessageSquare } from "lucide-react";

export type Notification = {
  id: string;
  kind: "assignment" | "mention" | "reply";
  /** The task or project for assignments. */
  title: string;
  /** Who acted, or null when the server could not name them. */
  actorName: string | null;
  actorImage: string | null;
  /** Where it happened, as the reader sees it. */
  source: { kind: "project" | "channel" | "dm" | "group"; name: string; private?: boolean };
  /** One line of the message, with references the reader cannot open left unnamed. */
  excerpt: string | null;
  href: string;
  read: boolean;
  createdAt: string;
  count?: number;
  unreadCount?: number;
  otherActorCount?: number;
  mixedKinds?: boolean;
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
  if (item.mixedKinds && item.source.kind !== "project")
    return { verb: "updated a thread in", object: place(item.source) };
  if (item.kind === "assignment") return { verb: "assigned you", object: item.title };
  // A mention on a task comes from a comment.
  if (item.kind === "mention" && item.source.kind === "project")
    return { verb: "mentioned you in a comment on", object: item.title };
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
  const actors = `${actor}${item.otherActorCount ? ` and ${item.otherActorCount} ${item.otherActorCount === 1 ? "other" : "others"}` : ""}`;
  const { verb, object } = sentence(item);
  const detail = item.source.kind === "project" ? item.source.name : item.excerpt;
  return (
    <Collapsible asChild open={expanded} onOpenChange={setExpanded}>
      <li>
        <div className="group/row relative flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-row-hover has-[a:focus-visible]:bg-row-hover">
          <span
            aria-hidden="true"
            className={cn(
              "mt-2 size-1.5 shrink-0 rounded-full",
              item.read ? "bg-transparent" : "bg-primary",
            )}
          />
          <span aria-hidden="true" className="relative mt-0.5 shrink-0">
            <PersonAvatar name={actor} image={item.actorImage} />
            <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-surface text-muted-foreground ring-2 ring-surface group-hover/row:bg-row-hover group-hover/row:ring-row-hover">
              <Icon className="size-3" />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-baseline gap-2 text-sm">
              <a
                href={item.href}
                // One name for the row; a visually hidden span would add a stray space before ", unread".
                aria-label={`${actors} ${verb} ${object}${item.read ? "" : ", unread"}`}
                onClick={onOpen}
                className="min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={cn(item.read ? "font-medium" : "font-semibold")}>{actors}</span>{" "}
                <span className="text-muted-foreground">{verb}</span>{" "}
                <span className={cn(item.read ? "font-medium" : "font-semibold")}>
                  <LockedPlace item={item} object={object} />
                </span>
              </a>
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
            {item.count !== undefined && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                {item.count > 1 && renderEvents ? (
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
          </div>
          <Timestamp
            value={item.createdAt}
            format="relative"
            className="mt-0.5 shrink-0 text-xs text-muted-foreground"
          />
          {/* A fixed action column keeps timestamps aligned in read, unread, and event rows. */}
          <div className="w-8 shrink-0">
            {!item.read && showReadAction && (
              <RowActions label="Notification actions" className="-mt-1">
                <RowAction label="Mark as read" onClick={onRead}>
                  <Check aria-hidden="true" />
                </RowAction>
              </RowActions>
            )}
          </div>
        </div>
        {renderEvents && item.count !== undefined && item.count > 1 && (
          <CollapsibleContent>
            <div className="mt-1 mb-3 ml-12 border-l border-border pl-3">
              {expanded && renderEvents()}
            </div>
          </CollapsibleContent>
        )}
      </li>
    </Collapsible>
  );
}
