import type { ReactNode } from "react";
import { Platform, View } from "react-native";

import { AgentFace } from "../shared/agent-face";
import { PersonAvatar } from "../shared/person-avatar";
import { MessagePressable, useScreenReaderEnabled } from "@/components/gestures/message-pressable";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { countLabel, dayLabel, messageTime } from "@/features/messaging/format";
import type { Message } from "@/features/messaging/types";
import { cn } from "@/lib/utils";
import { Ellipsis, MessageSquareReply } from "lucide-react-native";

export function DayDivider({ date }: { date: string | Date }) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-2" accessibilityRole="header">
      <View className="h-px flex-1 bg-border" />
      <Text className="text-xs font-medium text-muted-foreground">{dayLabel(date)}</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}

export function MessageRow({
  message,
  grouped,
  highlighted,
  children,
  onActions,
  onAuthor,
  onThread,
}: {
  message: Message;
  grouped: boolean;
  highlighted: boolean;
  children: ReactNode;
  onActions?: () => void;
  onAuthor?: () => void;
  onThread?: () => void;
}) {
  const deleted = !!message.deletedAt;
  const agent = message.authorType === "agent";
  const screenReader = useScreenReaderEnabled();
  const showMore = !!onActions && (Platform.OS === "web" || screenReader);
  const avatar = agent ? (
    <AgentFace name={message.authorName} code={message.authorAvatar} />
  ) : (
    <PersonAvatar name={message.authorName} image={message.authorImage} />
  );
  return (
    <MessagePressable
      onLongPress={onActions}
      testID={`message-${message.id}`}
      className={cn(
        "flex-row gap-3 px-4",
        grouped ? "py-0.5" : "pb-0.5 pt-3",
        highlighted && "bg-primary/10",
      )}
    >
      <View className="w-8">
        {!grouped && onAuthor ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full p-0"
            onPress={onAuthor}
            accessibilityLabel={`Profile of ${message.authorName}`}
            hitSlop={8}
          >
            {avatar}
          </Button>
        ) : null}
        {!grouped && !onAuthor ? avatar : null}
      </View>
      <View className="min-w-0 flex-1">
        {!grouped ? (
          <View className="flex-row items-baseline gap-2">
            <Text className="shrink text-[15px] font-semibold" numberOfLines={1}>
              {message.authorName}
            </Text>
            {agent ? <Text className="text-xs text-muted-foreground">Agent</Text> : null}
            {message.authorExternal ? (
              <Text className="text-xs text-muted-foreground">External</Text>
            ) : null}
            <Text className="text-xs text-muted-foreground">{messageTime(message.createdAt)}</Text>
          </View>
        ) : null}
        {deleted ? (
          <Text className="text-[15px] italic text-muted-foreground">
            This message was deleted.
          </Text>
        ) : (
          children
        )}
        {message.editedAt && !deleted ? (
          <Text className="text-xs text-muted-foreground">(edited)</Text>
        ) : null}
        {onThread && message.replyCount > 0 ? (
          <Button
            variant="ghost"
            accessibilityRole="button"
            onPress={onThread}
            className="min-h-11 flex-row items-center gap-1.5 self-start px-0 py-0"
            hitSlop={4}
          >
            <Icon as={MessageSquareReply} className="size-4 text-primary" />
            <Text className="text-sm font-medium text-primary">
              {countLabel(message.replyCount, "reply", "replies")}
            </Text>
          </Button>
        ) : null}
      </View>
      {showMore ? (
        <Button
          variant="outline"
          size="icon"
          className={cn(
            "absolute right-3 top-1 size-8 rounded-md",
            Platform.select({
              web: "opacity-0 focus-visible:opacity-100 group-hover/message:opacity-100",
            }),
          )}
          hitSlop={8}
          onPress={onActions}
          accessibilityLabel={`More actions for message from ${message.authorName}`}
        >
          <Icon as={Ellipsis} className="size-4 text-muted-foreground" />
        </Button>
      ) : null}
    </MessagePressable>
  );
}
