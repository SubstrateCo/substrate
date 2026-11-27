import type { AgentAvatarCode } from "@substrate/contracts/agents";
import type { ConversationKind } from "@substrate/contracts/messaging/input";

import { Link } from "@tanstack/react-router";

import { useId, useState } from "react";

import { discussionConversationName } from "./conversation-name";
import { AgentAvatarView } from "@/components/agents/agent-avatar";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Tag } from "@/components/feedback/tag";
import { ConversationKindIcon } from "@/components/messaging/conversations/conversation-kind-icon";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Timestamp } from "@/components/time/timestamp";
import { Item, ItemContent, ItemMedia } from "@/components/ui/item";
import { plainReferenceText } from "@/lib/messaging/reference-token";
import type { RecordLink } from "@/lib/navigation/record-links";
import { cn } from "cn";
import { MessageCircle, MessageSquareReply } from "lucide-react";

export type Discussion = {
  messageId: string;
  /** `discussion`: a thread in the discussion of one of a project's tasks. */
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
  const author = item.authorName ?? "Unknown author";
  return (
    <DiscussionItemLayout
      avatar={
        item.authorType === "agent" ? (
          <AgentAvatarView avatar={item.authorAvatar ?? null} className="mt-0.5" />
        ) : (
          <PersonAvatar name={author} image={item.authorImage} className="mt-0.5" />
        )
      }
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
            <span className="truncate font-medium">{author}</span>
            {item.authorType === "agent" && <Tag className="shrink-0">Agent</Tag>}
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

// Render the message like chat, but cap its height and fade it out when it overflows.
function DiscussionBody({ body }: { body: string }) {
  const [overflows, setOverflows] = useState(false);
  function ref(element: HTMLDivElement) {
    const observer = new ResizeObserver(() =>
      setOverflows(element.scrollHeight > element.clientHeight),
    );
    // The capped box keeps its size when the content grows, so watch the content too.
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }
  return (
    <div
      ref={ref}
      className={cn(
        // Keep links, tables, and code blocks above the card link so they stay usable.
        "max-h-48 overflow-hidden [&_:is(a,table,pre)]:relative [&_:is(a,table,pre)]:z-10",
        overflows && "mask-b-from-70%",
      )}
    >
      <MessageMarkdown body={plainReferenceText(body)} />
    </div>
  );
}
