import { ActivityIndicator, View } from "react-native";

import { Text } from "@/components/ui/text";

export function LoadingScreen({ label = "Opening your workspace…" }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <ActivityIndicator accessibilityLabel={label} />
      <Text className="text-sm text-muted-foreground">{label}</Text>
    </View>
  );
}
