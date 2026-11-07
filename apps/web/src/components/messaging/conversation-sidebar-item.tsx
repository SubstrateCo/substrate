import { Button } from "../ui/button";
import { conversationName, type Conversation } from "./types";
import { Hash, LockKeyhole, MessageCircle, Users } from "lucide-react";

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
      className="mb-1 w-full justify-start"
      aria-current={selected ? "page" : undefined}
      onClick={onSelect}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{conversationName(conversation)}</span>
    </Button>
  );
}
