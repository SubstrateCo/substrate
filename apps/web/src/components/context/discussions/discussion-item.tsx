import type { AgentAvatarCode } from "@substrate/contracts/agents";
import type { ConversationKind } from "@substrate/contracts/messaging/input";

import { Link } from "@tanstack/react-router";

import { useId, useState } from "react";

import { useRecordReferences } from "../references/use-record-references";
import { discussionConversationName } from "./conversation-name";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { ConversationKindIcon } from "@/components/messaging/conversations/conversation-kind-icon";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { ActorAvatar, ActorKindTag } from "@/components/people/actor-avatar";
import { Timestamp } from "@/components/time/timestamp";
import { Item, ItemContent, ItemMedia } from "@/components/ui/item";
import { actorIdentity } from "@/lib/actors/identity";
import type { RecordLink } from "@/lib/navigation/record-links";
import { cn } from "cn";
import { MessageCircle, MessageSquareReply } from "lucide-react";

export type Discussion = {
  messageId: string;
  purpose: "source" | "mention" | "association" | "discussion";
  link: RecordLink;
  conversationName: string | null;
  conversationKind?: ConversationKind;
  private?: boolean;
  authorName: string | null;
  authorImage?: string | null;
  authorAvatar?: AgentAvatarCode | null;
  authorType?: "human" | "agent";
  createdAt: string;
  body: string;
  deletedAt?: string | null;
  replyCount?: number;
};

export function DiscussionItem({ item }: { item: Discussion }) {
  const descriptionId = useId();
  const conversation = discussionConversationName(item);
  const title = `${
    {
      source: "Created from a discussion",
      mention: "Related discussion",
      association: "Related discussion",
      discussion: "Task discussion",
    }[item.purpose]
  } · ${conversation}`;
  const relationship = {
    source: "Created from this discussion",
    mention: "Linked through a reference",
    association: "Linked work",
    discussion: "Discussed on a task",
  }[item.purpose];
  const author = actorIdentity({
    type: item.authorType,
    name: item.authorName ?? "Unknown author",
    image: item.authorImage,
    avatar: item.authorAvatar,
  });
  return (
    <DiscussionItemLayout
      avatar={<ActorAvatar actor={author} className="mt-0.5" />}
      meta={
        <>
          {item.conversationKind ? (
            <ConversationKindIcon
              kind={item.conversationKind}
              private={item.private}
              className="size-3.5 shrink-0"
            />
          ) : (
            <MessageCircle aria-hidden="true" className="size-3.5 shrink-0" />
          )}
          {/* Stretch the link over the card. A card-wide <a> would nest Markdown links. */}
          <Link
            {...item.link}
            aria-label={title}
            aria-describedby={descriptionId}
            className="truncate font-medium text-foreground outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {conversation}
          </Link>
          <span aria-hidden="true">·</span>
          <Timestamp value={item.createdAt} className="relative z-10 shrink-0" />
        </>
      }
      descriptionId={descriptionId}
      content={
        <>
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="truncate font-medium">{author.name}</span>
            <ActorKindTag actor={author} className="shrink-0" />
          </div>
          {item.deletedAt ? (
            <p className="text-sm text-muted-foreground italic">Message deleted</p>
          ) : (
            <DiscussionBody body={item.body} />
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
            {!!item.replyCount && (
              <span className="flex items-center gap-1">
                <MessageSquareReply aria-hidden="true" className="size-3.5" />
                {item.replyCount} {item.replyCount === 1 ? "reply" : "replies"}
              </span>
            )}
            <span>{relationship}</span>
          </div>
        </>
      }
    />
  );
}

function DiscussionItemLayout({
  avatar,
  meta,
  content,
  descriptionId,
}: {
  avatar: React.ReactNode;
  meta: React.ReactNode;
  content: React.ReactNode;
  descriptionId?: string;
}) {
  return (
    <Item asChild variant="outline" className="relative items-start">
      <li>
        <ItemMedia>{avatar}</ItemMedia>
        <ItemContent className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {meta}
          </div>
          <div id={descriptionId} className="flex min-w-0 flex-col gap-1">
            {content}
          </div>
        </ItemContent>
      </li>
    </Item>
  );
}

export function DiscussionItemSkeleton() {
  return (
    <DiscussionItemLayout
      avatar={<SkeletonText width="1.5rem" className="mt-0.5 h-6 shrink-0 rounded-full" />}
      meta={<SkeletonText width="9rem" />}
      content={
        <>
          <div className="text-sm">
            <SkeletonText width="6rem" />
          </div>
          <div className="text-sm">
            <SkeletonText width="80%" />
          </div>
          <div className="pt-1 text-xs">
            <SkeletonText width="8rem" />
          </div>
        </>
      }
    />
  );
}

function DiscussionBody({ body }: { body: string }) {
  const [overflows, setOverflows] = useState(false);
  const { references, loading } = useRecordReferences(body);
  function ref(element: HTMLDivElement) {
    const observer = new ResizeObserver(() =>
      setOverflows(element.scrollHeight > element.clientHeight),
    );
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }
  return (
    <div
      ref={ref}
      className={cn(
        "max-h-48 overflow-hidden [&_:is(a,table,pre)]:relative [&_:is(a,table,pre)]:z-10",
        overflows && "mask-b-from-70%",
      )}
    >
      <MessageMarkdown body={body} references={references} referencesLoading={loading} />
    </div>
  );
}
