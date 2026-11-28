import type { ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";

import { keyboardBehavior } from "./keyboard";
import { NavigationSurface } from "@/components/gestures/navigation-surface";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { X } from "lucide-react-native";

export function PanelSheet({
  title,
  onClose,
  trailing,
  scroll = true,
  children,
}: {
  title: string;
  onClose: () => void;
  trailing?: ReactNode;
  scroll?: boolean;
  children: ReactNode;
}) {
  return (
    <NavigationSurface side="right" title={title} onClose={onClose}>
      {(close) => (
        <KeyboardAvoidingView className="flex-1" behavior={keyboardBehavior}>
          <View className="h-12 flex-row items-center border-b border-border px-1">
            <Button variant="ghost" size="icon" onPress={() => close()} accessibilityLabel="Close">
              <Icon as={X} className="size-5 text-foreground" />
            </Button>
            <Text
              className="flex-1 text-center text-[15px] font-semibold"
              numberOfLines={1}
              accessibilityRole="header"
            >
              {title}
            </Text>
            <View className="min-w-12 items-end">{trailing}</View>
          </View>
          {scroll ? (
            <ScrollView
              className="flex-1"
              contentContainerClassName="gap-5 p-4 pb-10"
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            <View className="flex-1">{children}</View>
          )}
        </KeyboardAvoidingView>
      )}
    </NavigationSurface>
  );
}

export function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-1">
      <Text className="text-xs font-medium text-muted-foreground" accessibilityRole="header">
        {title}
      </Text>
      <View>{children}</View>
    </View>
  );
}
