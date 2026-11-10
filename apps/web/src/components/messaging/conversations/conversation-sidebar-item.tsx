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
      data-conversation-item=""
      aria-current={selected ? "page" : undefined}
      // The name is cut off in a narrow sidebar, so the full name is always on hover.
      title={
        conversation.partner
          ? `${conversationName(conversation)} · includes people from another organization`
          : conversationName(conversation)
      }
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
