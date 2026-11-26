import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { MessageReaction } from "@/features/messaging/types";
import { cn } from "@/lib/utils";

export function MessageReactions({
  reactions,
  disabled,
  onToggle,
  onShowPeople,
}: {
  reactions: MessageReaction[];
  disabled: boolean;
  onToggle: (emoji: string) => void;
  onShowPeople: (emoji: string) => void;
}) {
  if (!reactions.length) return null;
  return (
    <View className="flex-row flex-wrap gap-1.5 pt-1">
      {reactions.map((reaction) => (
        <Button
          variant="ghost"
          key={reaction.emoji}
          accessibilityRole="button"
          accessibilityLabel={`${reaction.emoji} ${reaction.count}${reaction.reacted ? ", you reacted" : ""}`}
          accessibilityHint={
            disabled
              ? "Double tap to see who reacted."
              : "Double tap to toggle. Long press to see who reacted."
          }
          accessibilityState={{ selected: reaction.reacted }}
          onPress={() => (disabled ? onShowPeople(reaction.emoji) : onToggle(reaction.emoji))}
          onLongPress={() => onShowPeople(reaction.emoji)}
          hitSlop={6}
          className={cn(
            "min-h-8 flex-row items-center gap-1 rounded-full border px-2.5",
            reaction.reacted ? "border-primary bg-primary/10" : "border-border bg-muted/40",
          )}
        >
          <Text className="text-sm">{reaction.emoji}</Text>
          <Text
            className={cn(
              "text-xs tabular-nums",
              reaction.reacted ? "text-primary" : "text-muted-foreground",
            )}
          >
            {reaction.count}
          </Text>
        </Button>
      ))}
    </View>
  );
}
