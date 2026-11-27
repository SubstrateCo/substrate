import { Icon } from "@/components/ui/icon";
import type { Conversation } from "@/features/messaging/types";
import { cn } from "@/lib/utils";
import { Bot, Hash, ListTodo, LockKeyhole, MessageCircle, Users } from "lucide-react-native";

function conversationIcon(conversation: Pick<Conversation, "kind" | "private" | "task">) {
  if (conversation.task) return ListTodo;
  if (conversation.kind === "agent_dm") return Bot;
  if (conversation.kind === "channel") return conversation.private ? LockKeyhole : Hash;
  return conversation.kind === "group" ? Users : MessageCircle;
}

export function ConversationKindIcon({
  conversation,
  className,
}: {
  conversation: Pick<Conversation, "kind" | "private" | "task">;
  className?: string;
}) {
  return (
    <Icon
      as={conversationIcon(conversation)}
      className={cn("size-4 text-muted-foreground", className)}
    />
  );
}
