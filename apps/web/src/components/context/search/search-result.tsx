import { useRef } from "react";

import { Button } from "../../ui/button";
import { CommandItem, CommandShortcut } from "../../ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { plainReferenceText } from "@/components/messaging/references/reference-token";
import { ArrowUpLeft, CircleCheck, FolderKanban, Hash, MessageSquare } from "lucide-react";

export type SearchResultItem = { id: string; kind: string; title: string; href: string };

export function SearchResult({
  item,
  onRelated,
}: {
  item: SearchResultItem;
  onRelated: () => void;
}) {
  const link = useRef<HTMLAnchorElement>(null);
  const Icon =
    { task: CircleCheck, project: FolderKanban, message: MessageSquare, conversation: Hash }[
      item.kind
    ] ?? Hash;
  const title = plainReferenceText(item.title);
  return (
    <div className="group/result flex items-center gap-1 px-1">
      <CommandItem value={item.id} onSelect={() => link.current?.click()} className="flex-1">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        <a
          ref={link}
          className="min-w-0 flex-1 truncate outline-none focus-visible:underline"
          href={item.href}
          aria-label={`${item.kind} · ${title}`}
          onClick={(event) => event.stopPropagation()}
        >
          {title}
        </a>
        <CommandShortcut>{item.kind}</CommandShortcut>
      </CommandItem>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Find related records for ${title}`}
            onClick={onRelated}
          >
            <ArrowUpLeft />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Find related records</TooltipContent>
      </Tooltip>
    </div>
  );
}
