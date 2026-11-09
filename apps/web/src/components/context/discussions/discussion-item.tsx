import { useEffect, useId, useRef, useState } from "react";

import { Avatar, AvatarFallback } from "../../ui/avatar";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { plainReferenceText } from "@/components/messaging/references/reference-token";
import { cn } from "cn";
import { Hash, MessageSquare, MessageSquareReply } from "lucide-react";

export type Discussion = {
  messageId: string;
  purpose: "source" | "mention" | "association";
  href: string;
  conversationName: string | null;
  authorName: string | null;
  authorType?: "human" | "agent";
  createdAt: string;
  body: string;
  replyCount?: number;
};

const relativeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

function relativeTime(value: string) {
  const seconds = (new Date(value).getTime() - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of relativeUnits)
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  return "just now";
}

export function DiscussionItem({ item }: { item: Discussion }) {
  const descriptionId = useId();
  const conversation = item.conversationName ?? "Direct conversation";
  const title = `${item.purpose === "source" ? "Created from a discussion" : "Related discussion"} · ${conversation}`;
  const relationship = {
    source: "Created from this discussion",
    mention: "Linked through a reference",
    association: "Linked work",
  }[item.purpose];
  const ConversationIcon = item.conversationName ? Hash : MessageSquare;
  const author = item.authorName ?? "Unknown author";
  return (
    <li className="relative flex min-w-0 gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-foreground/15 hover:bg-muted/50">
      <Avatar size="sm" variant="user" className="mt-0.5">
        <AvatarFallback>{author.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <ConversationIcon aria-hidden="true" className="size-3.5 shrink-0" />
          {/* Stretch the link over the card. A card-wide <a> would nest Markdown links. */}
          <a
            href={item.href}
            aria-label={title}
            aria-describedby={descriptionId}
            className="truncate font-medium text-foreground outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {conversation}
          </a>
          <span aria-hidden="true">·</span>
          <time dateTime={item.createdAt} className="shrink-0 whitespace-nowrap">
            {relativeTime(item.createdAt)}
          </time>
        </div>
        <div id={descriptionId} className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="truncate font-medium">{author}</span>
            {item.authorType === "agent" && (
              <span className="shrink-0 rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                Agent
              </span>
            )}
          </div>
          <DiscussionBody body={item.body} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
            {!!item.replyCount && (
              <span className="flex items-center gap-1">
                <MessageSquareReply aria-hidden="true" className="size-3.5" />
                {item.replyCount} {item.replyCount === 1 ? "reply" : "replies"}
              </span>
            )}
            <span>{relationship}</span>
          </div>
        </div>
      </div>
    </li>
  );
}

// Render the message like chat, but cap its height and fade it out when it overflows.
function DiscussionBody({ body }: { body: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setOverflows(element.scrollHeight > element.clientHeight),
    );
    // The capped box keeps its size when the content grows, so watch the content too.
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, []);
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
