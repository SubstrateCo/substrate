import type { ConversationKind } from "@substrate/contracts/messaging/input";

import { Link } from "@tanstack/react-router";

import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Tag } from "@/components/feedback/tag";
import { ConversationKindIcon } from "@/components/messaging/conversations/conversation-kind-icon";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Timestamp } from "@/components/time/timestamp";
import type { RecordLink } from "@/lib/navigation/record-links";
import { CircleDot, Link2, MessageCircle, MessageSquare, Unlink } from "lucide-react";

export type ActivityEvent = {
  id: string;
  action: string;
  actorName: string | null;
  actorImage?: string | null;
  actorType?: "human" | "agent";
  createdAt: string;
  source: {
    link: RecordLink;
    conversationName: string | null;
    conversationKind?: ConversationKind;
    private?: boolean;
  } | null;
};

// Known server actions read as a verb phrase after the actor's name.
const phrasing = new Map([
  ["Task created", { icon: CircleDot, verb: "created the task" }],
  ["Created from a discussion", { icon: MessageSquare, verb: "created this from" }],
  ["Discussion linked", { icon: Link2, verb: "linked" }],
  ["Discussion unlinked", { icon: Unlink, verb: "unlinked" }],
]);

export function ActivityRow({ event }: { event: ActivityEvent }) {
  const known = phrasing.get(event.action);
  const Icon = known?.icon ?? CircleDot;
  return (
    <ActivityRowLayout
      icon={<Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
      content={
        <>
          <PersonAvatar
            name={event.actorName ?? "Unknown"}
            image={event.actorImage}
            agent={event.actorType === "agent"}
            size="xs"
          />
          <span className="truncate font-medium">{event.actorName ?? "Unknown"}</span>
          {event.actorType === "agent" && (
            <Tag size="sm" className="shrink-0">
              Agent
            </Tag>
          )}
          <span className="truncate text-muted-foreground">{known?.verb ?? event.action}</span>
          {event.source && (
            <Link
              {...event.source.link}
              className="inline-flex min-w-0 items-center gap-0.5 rounded-sm bg-muted px-1 font-medium outline-none hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring"
            >
              {event.source.conversationKind ? (
                <ConversationKindIcon
                  kind={event.source.conversationKind}
                  private={event.source.private}
                  className="size-3 shrink-0 text-muted-foreground"
                />
              ) : (
                <MessageCircle
                  aria-hidden="true"
                  className="size-3 shrink-0 text-muted-foreground"
                />
              )}
              <span className="truncate">
                {event.source.conversationName ??
                  (event.source.conversationKind === "group" ? "Group message" : "Direct message")}
              </span>
            </Link>
          )}
        </>
      }
      meta={<Timestamp value={event.createdAt} />}
    />
  );
}

function ActivityRowLayout({
  icon,
  content,
  meta,
}: {
  icon: React.ReactNode;
  content: React.ReactNode;
  meta: React.ReactNode;
}) {
  return (
    <li className="-mx-2 flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-row-hover">
      {icon}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">{content}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
    </li>
  );
}

export function ActivityRowSkeleton() {
  return (
    <ActivityRowLayout
      icon={<SkeletonText width="0.875rem" className="h-3.5 shrink-0" />}
      content={
        <>
          <SkeletonText width="1.25rem" className="h-5 shrink-0 rounded-full" />
          <SkeletonText width="12rem" />
        </>
      }
      meta={<SkeletonText width="2rem" />}
    />
  );
}
