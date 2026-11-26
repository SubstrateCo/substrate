import type { ReactNode } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Paperclip, SendHorizontal } from "lucide-react-native";

export function ComposerView({
  picker,
  attachments,
  input,
  notice,
  canSend,
  pending,
  onAttach,
  onSend,
}: {
  picker?: ReactNode;
  attachments?: ReactNode;
  input: ReactNode;
  notice?: ReactNode;
  canSend: boolean;
  pending: boolean;
  onAttach: () => void;
  onSend: () => void;
}) {
  return (
    <View className="border-t border-border bg-surface">
      {picker}
      {notice}
      {attachments}
      <View className="flex-row items-end gap-1 px-1 py-1">
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          onPress={onAttach}
          accessibilityLabel="Attach files"
        >
          <Icon as={Paperclip} className="size-5 text-muted-foreground" />
        </Button>
        <View className="min-w-0 flex-1 rounded-2xl border border-input bg-background">
          {input}
        </View>
        <Button
          variant={canSend ? "default" : "ghost"}
          size="icon"
          disabled={!canSend || pending}
          onPress={onSend}
          accessibilityLabel={pending ? "Sending" : "Send message"}
          testID="send-message"
        >
          <Icon
            as={SendHorizontal}
            className={canSend ? "size-5 text-primary-foreground" : "size-5 text-muted-foreground"}
          />
        </Button>
      </View>
    </View>
  );
}

export function ComposerNotice({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "error";
  children: string;
}) {
  return (
    <Text
      accessibilityRole={tone === "error" ? "alert" : undefined}
      className={
        tone === "error"
          ? "px-4 pt-2 text-xs text-destructive"
          : "px-4 pt-2 text-xs text-muted-foreground"
      }
    >
      {children}
    </Text>
  );
}
