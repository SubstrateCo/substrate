import { useRef } from "react";

import { CommandItem, CommandShortcut } from "../../ui/command";
import { plainReferenceText } from "@/components/messaging/references/reference-token";
import { Hash, LockKeyhole, MessageCircle, Users } from "lucide-react";

export type SearchResultItem = {
  id: string;
  kind: string;
  title: string;
  href: string;
  // Conversation results only.
  conversationKind?: "dm" | "group" | "channel";
  // Conversation and channel results only.
  private?: boolean;
  // Channel results only.
  membership?: "joined" | "left" | "none";
  memberCount?: number;
};

// Only conversations get an icon, because it tells their type apart.
function ConversationIcon({ item }: { item: SearchResultItem }) {
  const className = "size-4 text-muted-foreground";
  if (item.conversationKind === "dm")
    return <MessageCircle className={className} aria-hidden="true" />;
  if (item.conversationKind === "group") return <Users className={className} aria-hidden="true" />;
  if (item.conversationKind !== "channel") return null;
  return item.private ? (
    <LockKeyhole className={className} aria-hidden="true" />
  ) : (
    <Hash className={className} aria-hidden="true" />
  );
}

export function SearchResult({ item, showKind }: { item: SearchResultItem; showKind: boolean }) {
  const link = useRef<HTMLAnchorElement>(null);
  const title = plainReferenceText(item.title);
  return (
    <div className="px-1">
      <CommandItem value={item.id} onSelect={() => link.current?.click()}>
        <ConversationIcon item={item} />
        <a
          ref={link}
          className="min-w-0 flex-1 truncate outline-none focus-visible:underline"
          href={item.href}
          aria-label={`${item.kind} · ${title}`}
          onClick={(event) => event.stopPropagation()}
        >
          {title}
        </a>
        {showKind && <CommandShortcut>{item.kind}</CommandShortcut>}
      </CommandItem>
    </div>
  );
}
