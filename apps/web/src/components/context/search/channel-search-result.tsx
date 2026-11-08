import { useRef } from "react";

import type { SearchResultItem } from "./search-result";
import { PendingButton } from "@/components/feedback/pending-button";
import { CommandItem } from "@/components/ui/command";
import { Hash, LockKeyhole } from "lucide-react";

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
  const Icon = item.private ? LockKeyhole : Hash;
  const members = item.memberCount === 1 ? "1 member" : `${item.memberCount ?? 0} members`;
  return (
    <div className="flex items-center gap-1 px-1">
      <CommandItem value={item.id} onSelect={() => link.current?.click()} className="flex-1">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        <a
          ref={link}
          className="min-w-0 flex-1 truncate outline-none focus-visible:underline"
          href={item.href}
          aria-label={`channel · ${item.title}`}
          onClick={(event) => event.stopPropagation()}
        >
          {item.title}
        </a>
        <span className="shrink-0 text-xs text-muted-foreground">{members}</span>
      </CommandItem>
      {item.membership === "joined" ? (
        <span className="w-14 shrink-0 text-center text-xs text-muted-foreground">Joined</span>
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
