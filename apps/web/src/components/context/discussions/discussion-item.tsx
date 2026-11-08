import { Item, ItemContent, ItemDescription } from "../../ui/item";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";

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

export function DiscussionItem({ item }: { item: Discussion }) {
  const title = `${item.purpose === "source" ? "Created from a discussion" : "Related discussion"} · ${item.conversationName ?? "Direct conversation"}`;
  const relationship = {
    source: "Created from this discussion",
    mention: "Linked through a reference",
    association: "Linked work",
  }[item.purpose];
  return (
    <Item variant="outline" className="items-start">
      <ItemContent className="min-w-0">
        <div className="space-y-3 px-1 py-1.5">
          <div className="space-y-1">
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
              {item.authorName}
              {item.authorType === "agent" && (
                <span className="mx-1 rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                  Agent
                </span>
              )}{" "}
              · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
            </ItemDescription>
          </div>
          <p className="line-clamp-3 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
            {item.body.replace(/@\[[^\]]+\]/g, "[Reference]")}
          </p>
          {item.replyCount !== undefined && (
            <p className="text-xs text-muted-foreground">
              {item.replyCount} {item.replyCount === 1 ? "reply" : "replies"} · {relationship}
            </p>
          )}
        </div>
      </ItemContent>
    </Item>
  );
}
