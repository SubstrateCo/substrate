import { Link } from "@tanstack/react-router";

import { useRef, type ReactNode } from "react";

import type { SearchResultItem } from "./search-result";
import { searchRowClass, SearchRowFrame } from "./search-row";
import { PendingButton } from "@/components/feedback/pending-button";
import { ConversationKindIcon } from "@/components/messaging/conversations/conversation-kind-icon";
import { CommandItem } from "@/components/ui/command";
import { CornerDownLeft } from "lucide-react";

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
    <SearchRowFrame>
      {/* The trailing action sits inside the item, so the highlight spans it. */}
      <CommandItem
        value={item.id}
        onSelect={() => link.current?.click()}
        // oxlint-disable-next-line shadcn/require-static-classes -- The shared classes match the command item's default geometry for inert rows.
        className={searchRowClass}
      >
        <ChannelSearchResultContent
          icon={
            <ConversationKindIcon
              kind="channel"
              private={item.private}
              className="size-4 text-muted-foreground"
            />
          }
          title={
            <Link
              ref={link}
              className="block truncate outline-none focus-visible:underline"
              {...item.link}
              aria-label={`Channel: ${item.title}`}
              onClick={(event) => event.stopPropagation()}
            >
              {item.title}
            </Link>
          }
          members={members}
          action={
            item.membership === "joined" ? (
              // "Joined" gives way to the Enter hint while the row is selected. The row itself opens.
              <span className="grid w-14 shrink-0 place-items-center text-xs">
                <span className="col-start-1 row-start-1 text-muted-foreground group-data-[selected=true]/command-item:opacity-0">
                  Joined
                </span>
                <span
                  aria-hidden="true"
                  className="col-start-1 row-start-1 flex items-center gap-1 font-medium opacity-0 group-data-[selected=true]/command-item:opacity-100"
                >
                  Open
                  <CornerDownLeft className="size-3 text-muted-foreground" />
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
                onClick={(event) => {
                  // Joining stays on the list; only the row itself opens the channel.
                  event.stopPropagation();
                  onJoin();
                }}
              >
                Join
              </PendingButton>
            )
          }
        />
      </CommandItem>
    </SearchRowFrame>
  );
}

export function ChannelSearchResultContent({
  icon,
  title,
  members,
  action,
}: {
  icon: ReactNode;
  title: ReactNode;
  members: ReactNode;
  action: ReactNode;
}) {
  return (
    <>
      {icon}
      <span className="min-w-0 flex-1">{title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{members}</span>
      <span className="w-14 shrink-0">{action}</span>
    </>
  );
}
