import type { ConversationKind } from "@substrate/contracts/messaging/input";

import { Link } from "@tanstack/react-router";

import { activityTime } from "./activity-time";
import { discussionConversationName } from "@/components/context/discussions/conversation-name";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { ConversationKindIcon } from "@/components/messaging/conversations/conversation-kind-icon";
import { ActorAvatar, ActorKindTag } from "@/components/people/actor-avatar";
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item";
import type { ActorIdentity } from "@/lib/actors/identity";
import type { RecordLink } from "@/lib/navigation/record-links";
import { CircleDot, Link2, MessageCircle, MessageSquare, Unlink } from "lucide-react";

export type ActivityEvent = {
  id: string;
  action: string;
  actor: ActorIdentity;
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
          <ActorAvatar actor={event.actor} size="xs" />
          <span className="max-w-full truncate font-medium">{event.actor.name}</span>
          <ActorKindTag actor={event.actor} size="sm" className="shrink-0" />
          <span className="max-w-full truncate text-muted-foreground">
            {known?.verb ?? event.action}
          </span>
          {event.source && (
            <Link
              {...event.source.link}
              className="inline-flex max-w-full min-w-0 items-center gap-0.5 rounded-sm bg-muted px-1 font-medium outline-none hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring"
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
              <span className="truncate">{discussionConversationName(event.source)}</span>
            </Link>
          )}
        </>
      }
      meta={<ActivityTimestamp value={event.createdAt} />}
    />
  );
}

function ActivityTimestamp({ value }: { value: string }) {
  const time = activityTime(value);
  if (!time) return null;
  return (
    <time
      dateTime={time.iso}
      aria-label={time.full}
      title={time.full}
      className="whitespace-nowrap tabular-nums"
    >
      {time.label}
    </time>
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
    <Item asChild size="xs" className="-mx-2.5 w-auto">
      <li>
        <ItemMedia>{icon}</ItemMedia>
        <ItemContent className="min-w-0">
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 sm:flex-nowrap">
            {content}
          </span>
        </ItemContent>
        <ItemActions className="shrink-0">
          <span className="text-xs text-muted-foreground">{meta}</span>
        </ItemActions>
      </li>
    </Item>
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
