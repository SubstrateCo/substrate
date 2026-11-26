import { View } from "react-native";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react-native";

const quickReactions = ["👍", "❤️", "😂", "🎉", "👀", "✅"] as const;

export type MessageAction = {
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  onPress: () => void;
};

/** Quick reactions and actions for one message. */
export function MessageActionsSheet({
  preview,
  canReact,
  reacted,
  actions,
  onReact,
  onMoreReactions,
  onClose,
}: {
  preview: string;
  canReact: boolean;
  reacted: ReadonlySet<string>;
  actions: MessageAction[];
  onReact: (emoji: string) => void;
  onMoreReactions: () => void;
  onClose: () => void;
}) {
  const run = (action: () => void) => {
    onClose();
    action();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-sm gap-3">
        <DialogHeader>
          <DialogTitle>Message</DialogTitle>
          <DialogDescription numberOfLines={3}>{preview}</DialogDescription>
        </DialogHeader>
        {canReact ? (
          <View className="flex-row justify-between">
            {quickReactions.map((emoji) => (
              <Button
                key={emoji}
                variant="ghost"
                size="icon"
                accessibilityLabel={
                  reacted.has(emoji) ? `Remove ${emoji} reaction` : `React with ${emoji}`
                }
                accessibilityState={{ selected: reacted.has(emoji) }}
                onPress={() => run(() => onReact(emoji))}
                className={cn("rounded-full", reacted.has(emoji) && "bg-primary/10")}
              >
                <Text className="text-xl">{emoji}</Text>
              </Button>
            ))}
          </View>
        ) : null}
        {canReact ? (
          <Button variant="ghost" onPress={() => run(onMoreReactions)}>
            <Text>More reactions</Text>
          </Button>
        ) : null}
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="ghost"
            onPress={() => run(action.onPress)}
            className="justify-start gap-3 px-2"
          >
            <Icon
              as={action.icon}
              className={cn(
                "size-4",
                action.destructive ? "text-destructive" : "text-muted-foreground",
              )}
            />
            <Text
              className={cn("text-[15px] font-normal", action.destructive && "text-destructive")}
            >
              {action.label}
            </Text>
          </Button>
        ))}
      </DialogContent>
    </Dialog>
  );
}
