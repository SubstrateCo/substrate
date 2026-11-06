import { Item, ItemContent, ItemDescription } from "../primitives/item";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../primitives/tooltip";

export type Discussion = {
  messageId: string;
  purpose: string;
  href: string;
  conversationName: string | null;
  authorName: string | null;
  createdAt: string;
  body: string;
};

export function DiscussionItem({ item }: { item: Discussion }) {
  const title = `${item.purpose === "source" ? "Created from a discussion" : "Related discussion"} · ${item.conversationName ?? "Direct conversation"}`;
  return (
    <Item size="xs" className="items-start">
      <ItemContent className="min-w-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                className="line-clamp-3 text-sm font-medium underline underline-offset-4 wrap-anywhere"
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
        <p className="line-clamp-3 whitespace-pre-wrap wrap-anywhere">
          {item.body.replace(/@\[[^\]]+\]/g, "[Reference]")}
        </p>
      </ItemContent>
    </Item>
  );
}
