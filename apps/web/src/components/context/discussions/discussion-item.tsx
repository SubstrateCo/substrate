import { useId } from "react";

import { Avatar, AvatarFallback } from "../../ui/avatar";
import { plainReferenceText } from "@/components/messaging/references/reference-token";
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
    <li>
      <a
        href={item.href}
        aria-label={title}
        aria-describedby={descriptionId}
        className="flex min-w-0 gap-3 rounded-lg border bg-card p-3 transition-colors outline-none hover:border-foreground/15 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar size="sm" variant="user" className="mt-0.5">
          <AvatarFallback>{author.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <ConversationIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate font-medium text-foreground">{conversation}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={item.createdAt} className="shrink-0 whitespace-nowrap">
              {relativeTime(item.createdAt)}
            </time>
          </span>
          <span id={descriptionId} className="flex min-w-0 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-1.5 text-sm">
              <span className="truncate font-medium">{author}</span>
              {item.authorType === "agent" && (
                <span className="shrink-0 rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                  Agent
                </span>
              )}
            </span>
            <span className="line-clamp-2 text-sm leading-relaxed wrap-anywhere text-muted-foreground">
              {plainReferenceText(item.body)}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
              {!!item.replyCount && (
                <span className="flex items-center gap-1">
                  <MessageSquareReply aria-hidden="true" className="size-3.5" />
                  {item.replyCount} {item.replyCount === 1 ? "reply" : "replies"}
                </span>
              )}
              <span>{relationship}</span>
            </span>
          </span>
        </span>
      </a>
    </li>
  );
}
