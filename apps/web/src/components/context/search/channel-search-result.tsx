import { useRef } from "react";

import type { SearchResultItem } from "./search-result";
import { PendingButton } from "@/components/feedback/pending-button";
import { ConversationKindIcon } from "@/components/messaging/conversations/conversation-kind-icon";
import { Button } from "@/components/ui/button";
import { CommandItem } from "@/components/ui/command";

export function ChannelSearchResult({
  item,
  joining,
  onJoin,
}: {
  item: SearchResultItem;
  joining: boolean;
  onJoin: () => void;
}) {
  const link = useRef<HTMLAnchorElement>(null);
  const members = item.memberCount === 1 ? "1 member" : `${item.memberCount ?? 0} members`;
  return (
    <div className="group/row flex items-center gap-1 px-1">
      <CommandItem value={item.id} onSelect={() => link.current?.click()} className="flex-1">
        <ConversationKindIcon
          kind="channel"
          private={item.private}
          className="size-4 text-muted-foreground"
        />
        <a
          ref={link}
          className="min-w-0 flex-1 truncate outline-none focus-visible:underline"
          href={item.href}
          aria-label={`Channel: ${item.title}`}
          onClick={(event) => event.stopPropagation()}
        >
          {item.title}
        </a>
        <span className="shrink-0 text-xs text-muted-foreground">{members}</span>
      </CommandItem>
      {item.membership === "joined" ? (
        // "Joined" gives way to "Open" while the row is hovered, selected, or has focus inside.
        <span className="grid w-14 shrink-0 place-items-center">
          <span className="col-start-1 row-start-1 text-xs text-muted-foreground group-focus-within/row:opacity-0 group-hover/row:opacity-0 group-has-data-[selected=true]/row:opacity-0">
            Joined
          </span>
          <span className="col-start-1 row-start-1 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 group-has-data-[selected=true]/row:opacity-100">
            <Button asChild variant="outline" size="xs" className="w-14">
              <a href={item.href} aria-label={`Open ${item.title}`}>
                Open
              </a>
            </Button>
          </span>
        </span>
      ) : (
        <PendingButton
          variant="outline"
          size="xs"
          className="w-14 shrink-0"
          aria-label={`Join ${item.title}`}
          pending={joining}
          pendingLabel="Joining"
          onClick={onJoin}
        >
          Join
        </PendingButton>
      )}
    </div>
  );
}
