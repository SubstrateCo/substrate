import { View } from "react-native";

import { AgentFace } from "../shared/agent-face";
import { ConversationKindIcon } from "../shared/conversation-icon";
import { PersonAvatar } from "../shared/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  conversationName,
  directPartner,
  type SidebarConversation,
} from "@/features/messaging/conversations/conversation-rules";
import { cn } from "@/lib/utils";

export function ConversationRow({
  conversation,
  viewerId,
  selected,
  onPress,
}: {
  conversation: SidebarConversation;
  viewerId: string;
  selected: boolean;
  onPress: () => void;
}) {
  const name = conversationName(conversation);
  const partner = directPartner(conversation, viewerId);
  const unread = conversation.unreadCount > 0;
  const label = [
    name,
    unread ? `${conversation.unreadCount} unread` : undefined,
    conversation.mentionCount ? `${conversation.mentionCount} mentions` : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  let leading = <ConversationKindIcon conversation={conversation} />;
  if (partner?.type === "agent")
    leading = <AgentFace name={partner.name} code={partner.avatar} size="sm" />;
  else if (partner) leading = <PersonAvatar name={partner.name} image={partner.image} size="sm" />;
  return (
    <Button
      variant="ghost"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={`conversation-${conversation.id}`}
      className={cn(
        "min-h-12 flex-row items-center justify-start gap-3 rounded-md px-3 py-0 active:bg-accent",
        selected && "bg-accent",
      )}
    >
      <View className="w-6 items-center">{leading}</View>
      <Text
        numberOfLines={1}
        className={cn(
          "flex-1 text-[15px]",
          unread ? "font-semibold text-foreground" : "text-muted-foreground",
          selected && "text-foreground",
        )}
      >
        {name}
      </Text>
      {conversation.mentionCount > 0 ? (
        <Badge
          variant="destructive"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text>{`@${conversation.mentionCount}`}</Text>
        </Badge>
      ) : null}
      {conversation.mentionCount === 0 && unread ? (
        <Badge
          variant="secondary"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text>{conversation.unreadCount > 99 ? "99+" : String(conversation.unreadCount)}</Text>
        </Badge>
      ) : null}
    </Button>
  );
}
