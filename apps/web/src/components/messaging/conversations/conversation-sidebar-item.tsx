import { Button } from "../../ui/button";
import { ConversationKindIcon } from "./conversation-kind-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
      onClick={onSelect}
    >
      {conversation.kind === "channel" && conversation.private ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span role="img" aria-label="Private channel" tabIndex={0} className="shrink-0">
              <ConversationKindIcon kind="channel" private className="size-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Private channel</TooltipContent>
        </Tooltip>
      ) : (
        <ConversationKindIcon
          kind={conversation.kind}
          private={conversation.private}
          className="size-4 shrink-0"
        />
      )}
      <span className={conversation.unreadCount ? "truncate font-semibold" : "truncate"}>
        {conversationName(conversation)}
      </span>
      {!!conversation.unreadCount && (
        <span
          className="ml-auto shrink-0 text-xs font-medium"
          aria-label={`${conversation.unreadCount} unread ${conversation.unreadCount === 1 ? "message" : "messages"}`}
        >
          {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
        </span>
      )}
      {/* Channels already sit under "Partner channels"; DMs and groups need the cue here. */}
      {conversation.partner && conversation.kind !== "channel" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="img"
              aria-label="Includes people from another organization"
              tabIndex={0}
              className="ml-auto shrink-0 text-muted-foreground"
            >
              <Globe aria-hidden="true" className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Includes people from another organization</TooltipContent>
        </Tooltip>
      )}
    </Button>
  );
}
