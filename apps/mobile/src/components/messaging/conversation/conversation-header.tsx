import { View } from "react-native";

import { ConversationKindIcon } from "../shared/conversation-icon";
import { PersonAvatar } from "../shared/person-avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  conversationName,
  directPartner,
} from "@/features/messaging/conversations/conversation-rules";
import { countLabel } from "@/features/messaging/format";
import type { Conversation } from "@/features/messaging/types";
import { Info } from "lucide-react-native";

export function ConversationHeader({
  conversation,
  viewerId,
  onDetails,
  onOpenTask,
}: {
  conversation: Conversation;
  viewerId: string;
  onDetails?: () => void;
  onOpenTask?: () => void;
}) {
  const partner = directPartner(conversation, viewerId);
  const partners = conversation.organizations.filter((org) => !org.own).map((org) => org.name);
  let subtitle = conversation.task
    ? "Task discussion"
    : [
        conversation.kind !== "dm"
          ? countLabel(conversation.members.length, "member", "members")
          : undefined,
        partners.length ? `With ${partners.join(", ")}` : undefined,
      ]
        .filter(Boolean)
        .join(" · ");
  if (conversation.kind === "agent_dm") subtitle = "Agent DM";
  const name = conversationName(conversation);
  const press = conversation.task ? onOpenTask : onDetails;
  return (
    <Button
      variant="ghost"
      accessibilityRole={press ? "button" : "header"}
      accessibilityLabel={
        press ? `${name}, ${conversation.task ? "open task" : "conversation details"}` : name
      }
      disabled={!press}
      onPress={press}
      className="min-h-12 flex-row items-center justify-start gap-3 rounded-none border-b border-border px-4 py-1 active:bg-accent"
      testID="conversation-header"
    >
      {partner ? (
        <PersonAvatar
          name={partner.name}
          image={partner.image}
          agent={partner.type === "agent"}
          size="sm"
        />
      ) : (
        <ConversationKindIcon conversation={conversation} />
      )}
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-semibold" numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {press && !conversation.task ? (
        <Icon as={Info} className="size-4 text-muted-foreground" />
      ) : null}
    </Button>
  );
}
