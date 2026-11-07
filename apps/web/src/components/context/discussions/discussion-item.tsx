import { Item, ItemContent, ItemDescription } from "../../ui/item";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";

export type Discussion = {
  messageId: string;
  purpose: "source" | "mention" | "association";
  href: string;
  conversationName: string | null;
  authorName: string | null;
  createdAt: string;
  body: string;
  replyCount?: number;
};

export function DiscussionItem({ item }: { item: Discussion }) {
  const title = `${item.purpose === "source" ? "Created from a discussion" : "Related discussion"} · ${item.conversationName ?? "Direct conversation"}`;
  const relationship = {
    source: "Created from this discussion",
    mention: "Linked through a reference",
    association: "Linked work",
  }[item.purpose];
  return (
    <Item size="xs" variant="outline" className="items-start">
      <ItemContent className="min-w-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                className="line-clamp-3 text-sm font-medium wrap-anywhere underline underline-offset-4"
                href={item.href}
              >
                {title}
              </a>
            </TooltipTrigger>
            <TooltipContent className="wrap-anywhere">{title}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <ItemDescription className="wrap-anywhere">
          {item.authorName} ·{" "}
          <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
        </ItemDescription>
        <p className="line-clamp-3 wrap-anywhere whitespace-pre-wrap">
          {item.body.replace(/@\[[^\]]+\]/g, "[Reference]")}
        </p>
        {item.replyCount !== undefined && (
          <p className="text-xs text-muted-foreground">
            {item.replyCount} {item.replyCount === 1 ? "reply" : "replies"} · {relationship}
          </p>
        )}
      </ItemContent>
    </Item>
  );
}
