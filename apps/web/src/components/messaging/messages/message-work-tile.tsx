import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { MessageCardRow } from "./message-card";
import type { MessageWorkLink } from "./message-work";
import { CircleCheck, FolderKanban, Unlink } from "lucide-react";

export function MessageWorkTile({
  link,
  removing,
  onRemove,
}: {
  link: MessageWorkLink;
  removing: boolean;
  onRemove?: (id: string) => void;
}) {
  const Icon = link.entityType === "task" ? CircleCheck : FolderKanban;
  return (
    <MessageCardRow className="group/work pl-1.5 hover:bg-muted/50">
      <a
        href={link.href}
        aria-label={`Open ${link.title}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span title={link.title} className="min-w-0 truncate font-medium">
          {link.title}
        </span>
        {link.purpose === "source" && (
          <span className="shrink-0 text-xs text-muted-foreground">Created here</span>
        )}
      </a>
      {link.statusName && (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
          {link.statusName}
        </span>
      )}
      {link.canRemove && onRemove && (
        <span className="opacity-0 transition-opacity group-focus-within/work:opacity-100 group-hover/work:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Unlink ${link.title}`}
                disabled={removing}
                onClick={() => onRemove(link.entityId)}
              >
                <Unlink aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Unlink {link.entityType}</TooltipContent>
          </Tooltip>
        </span>
      )}
    </MessageCardRow>
  );
}
