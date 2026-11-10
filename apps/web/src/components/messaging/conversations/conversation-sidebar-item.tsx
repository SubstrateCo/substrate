import { Button } from "../../ui/button";
import { conversationName, type Conversation } from "@/lib/messaging/conversations";
import { Globe, Hash, LockKeyhole, MessageCircle, Users } from "lucide-react";

export function ConversationSidebarItem({
  conversation,
  selected,
  onSelect,
}: {
  conversation: Conversation;
  selected: boolean;
  onSelect: () => void;
}) {
  let Icon = conversation.kind === "group" ? Users : MessageCircle;
  if (conversation.kind === "channel") Icon = conversation.private ? LockKeyhole : Hash;
  return (
    <Button
      variant="sidebar"
      className="w-full justify-start"
      aria-current={selected ? "page" : undefined}
      title={conversation.partner ? "Includes people from another organization" : undefined}
      onClick={onSelect}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{conversationName(conversation)}</span>
      {/* Channels already sit under "Partner channels"; DMs and groups need the cue here. */}
      {conversation.partner && conversation.kind !== "channel" && (
        <Globe aria-hidden="true" className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
      )}
    </Button>
  );
}
