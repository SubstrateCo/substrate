import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Layers2 } from "lucide-react-native";

export function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="mx-auto w-full max-w-md flex-1 justify-center px-6 py-12">
          <View className="mb-10 flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Icon as={Layers2} size={22} className="text-primary-foreground" strokeWidth={1.8} />
            </View>
            <Text className="text-xl font-semibold tracking-tight">Substrate</Text>
          </View>
          <View className="mb-8 gap-2">
            <Text accessibilityRole="header" className="text-3xl font-semibold tracking-tight">
              {title}
            </Text>
            <Text className="text-base leading-6 text-muted-foreground">{description}</Text>
          </View>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
