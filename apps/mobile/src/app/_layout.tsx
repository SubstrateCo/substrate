import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useState } from "react";

import { AuthProvider } from "@/auth/provider";
import { AppErrorScreen } from "@/components/layout/error-screen";
import { MobileThemeProvider } from "@/theme";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <AppErrorScreen {...props} />;
}

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1 },
          mutations: { retry: false, networkMode: "always" },
        },
      }),
  );

  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <MobileThemeProvider>
            <AuthProvider>
              <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />
            </AuthProvider>
          </MobileThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
