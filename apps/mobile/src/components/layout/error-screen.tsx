import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { ErrorBoundaryProps } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export function AppErrorScreen({ retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView className="flex-1 justify-center gap-4 bg-background px-6">
      <Text className="text-2xl font-semibold">Something went wrong</Text>
      <Text className="text-muted-foreground">
        This screen couldn’t open. Try again to reload it.
      </Text>
      <Button className="self-start" onPress={retry}>
        <Text>Try again</Text>
      </Button>
    </SafeAreaView>
  );
}
