import type { AgentAvatarCode } from "@substrate/contracts/agents";

import { Link } from "@tanstack/react-router";

import { useState, type MouseEvent, type ReactNode } from "react";

import { RowAction, RowActions } from "../../layout/row-actions";
import { rowTitleVariants } from "../../layout/row-state";
import { Timestamp } from "../../time/timestamp";
import { notificationActor } from "./notification-actor";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { ActorAvatar } from "@/components/people/actor-avatar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item";
import { conversationLabel } from "@/lib/messaging/conversations";
import type { RecordLink } from "@/lib/navigation/record-links";
import { cn } from "cn";
import { AtSign, Check, ChevronRight, ListTodo, LockKeyhole, MessageSquare } from "lucide-react";

export type Notification = {
  id: string;
  kind: "assignment" | "mention" | "reply" | "message";
  title: string;
  actorName: string | null;
  actorImage: string | null;
  actorAvatar?: AgentAvatarCode | null;
  source: {
    kind: "project" | "channel" | "dm" | "agent_dm" | "group";
    name: string;
    private?: boolean;
  };
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

function place(source: Notification["source"]) {
  if (source.kind === "agent_dm") return "an agent DM";
  if (source.kind === "dm") return "a direct message";
  if (source.kind === "project") return source.name;
  return conversationLabel({ ...source, kind: source.kind });
}

function sentence(item: Notification) {
  if (item.mixedKinds && item.source.kind !== "project")
    return { verb: "updated a thread in", object: place(item.source) };
  if (item.kind === "assignment") return { verb: "assigned you", object: item.title };
  if (item.kind === "mention" && item.source.kind === "project")
    return { verb: "mentioned you in a comment on", object: item.title };
  if (item.kind === "mention") return { verb: "mentioned you in", object: place(item.source) };
  if (item.kind === "message" && item.source.kind === "agent_dm")
    return { verb: "sent you", object: "an agent DM" };
  if (item.kind === "message")
    return item.source.kind === "dm"
      ? { verb: "sent you", object: "a direct message" }
      : { verb: "sent a message in", object: place(item.source) };
  return { verb: "replied to a thread in", object: place(item.source) };
}

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
}: {
  item: Notification;
  onRead?: () => void;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
  renderEvents?: () => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = kindIcons[item.kind];
  const actor = notificationActor(item);
  const events: GroupedEvents | undefined =
    item.count !== undefined && item.count > 1
      ? { count: item.count, unread: item.unreadCount, render: renderEvents }
      : undefined;
  return (
    <Collapsible asChild open={expanded} onOpenChange={setExpanded}>
      <li>
        <NotificationRowLayout
          unread={!item.read}
          avatar={
            <>
              <ActorAvatar actor={actor} />
              <span className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full bg-surface text-muted-foreground ring-1 ring-surface">
                <Icon className="size-2.5" />
              </span>
            </>
          }
          content={
            <>
              <NotificationSummary item={item} actor={actor.name} onOpen={onOpen} />
              {events && <NotificationEvents events={events} expanded={expanded} />}
            </>
          }
          meta={<Timestamp value={item.createdAt} format="relative" />}
          action={
            !item.read &&
            onRead && (
              <RowActions label="Notification actions" className="-mt-1">
                <RowAction label="Mark as read" onClick={onRead}>
                  <Check aria-hidden="true" />
                </RowAction>
              </RowActions>
            )
          }
        />
        {events?.render && (
          <CollapsibleContent>
            <div className="mt-1 mb-3 ml-6 border-l pl-2 sm:ml-12 sm:pl-3">
              {expanded && events.render()}
            </div>
          </CollapsibleContent>
        )}
      </li>
    </Collapsible>
  );
}

type GroupedEvents = { count: number; unread?: number; render?: () => ReactNode };

function NotificationEvents({ events, expanded }: { events: GroupedEvents; expanded: boolean }) {
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
      {events.render ? (
        <CollapsibleTrigger asChild>
          <Button
            variant="disclosure"
            size="xs"
            aria-label={`${expanded ? "Hide" : "Show"} ${events.count} events`}
          >
            <ChevronRight
              aria-hidden="true"
              className={cn("size-3 transition-transform", expanded && "rotate-90")}
            />
            {events.count} events
          </Button>
        </CollapsibleTrigger>
      ) : (
        <span>{events.count} events</span>
      )}
      {!!events.unread && <span>{events.unread} unread</span>}
    </div>
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
    // oxlint-disable-next-line shadcn/no-restyle -- This multi-control notification is not an anchor; its whole row must respond to hover and link focus.
    <Item className="group/row relative items-start hover:bg-row-hover has-[a:focus-visible]:bg-row-hover">
      <span
        aria-hidden="true"
        className={cn(
          "mt-2 size-1.5 shrink-0 rounded-full",
          unread ? "bg-primary" : "bg-transparent",
        )}
      />
      <ItemMedia aria-hidden="true" className="relative">
        {avatar}
      </ItemMedia>
      <ItemContent className="min-w-0">{content}</ItemContent>
      <ItemActions className="shrink-0">
        <span className="text-xs text-muted-foreground">{meta}</span>
        {action}
      </ItemActions>
    </Item>
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
  const nameWeight = item.read ? "font-medium" : rowTitleVariants({ state: "unread" });
  return (
    <>
      <p className="flex min-w-0 items-baseline gap-2 text-sm">
        <Link
          {...item.link}
          aria-label={`${actors} ${verb} ${object}${item.read ? "" : ", unread"}`}
          onClick={onOpen}
          className="min-w-0 flex-1 rounded-sm wrap-anywhere outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
