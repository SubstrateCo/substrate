import { Button } from "../../ui/button";
import { ConversationKindIcon } from "./conversation-kind-icon";
import { conversationName, type Conversation } from "@/lib/messaging/conversations";
import { Globe } from "lucide-react";

export function ConversationSidebarItem({
  conversation,
  selected,
  onSelect,
}: {
  conversation: Conversation;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      variant="sidebar"
      className="w-full justify-start"
      aria-current={selected ? "page" : undefined}
      title={conversation.partner ? "Includes people from another organization" : undefined}
      onClick={onSelect}
    >
      <ConversationKindIcon
        kind={conversation.kind}
        private={conversation.private}
        className="size-4 shrink-0"
      />
      <span className="truncate">{conversationName(conversation)}</span>
      {/* Channels already sit under "Partner channels"; DMs and groups need the cue here. */}
      {conversation.partner && conversation.kind !== "channel" && (
        <Globe aria-hidden="true" className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
      )}
    </Button>
  );
}
