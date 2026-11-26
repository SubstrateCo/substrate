import "../../global.css";
import { metrics } from "@substrate/design-tokens";

import { useEffect, type ReactNode } from "react";

import geistWeights from "./geist-weights.json";
import { NAV_THEME, THEME, type ColorScheme } from "./navigation";
import { useRootColorScheme } from "./use-root-color-scheme";
import * as Geist from "@expo-google-fonts/geist";
import type { FontSource } from "expo-font";
import { ThemeProvider } from "expo-router/react-navigation";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";

const geistFonts = Object.fromEntries(
  // SAFETY: The checked-in weight map contains only Geist font-asset exports, not the package's hooks.
  Object.values(geistWeights).map((family) => [
    family,
    Geist[family as keyof typeof Geist] as FontSource,
  ]),
);

void SplashScreen.preventAutoHideAsync();

export function useTheme() {
  const theme = useColorScheme();
  const scheme: ColorScheme = theme.colorScheme ?? "light";
  return {
    colorScheme: scheme,
    colors: THEME[scheme],
    metrics,
    setColorScheme: (value: "light" | "dark" | "system") => theme.setColorScheme(value),
    toggleColorScheme: () => theme.toggleColorScheme(),
  };
}

export function MobileThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme } = useTheme();
  useRootColorScheme(colorScheme);
  const [fontsLoaded, fontError] = Geist.useFonts(geistFonts);
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return (
    <ThemeProvider value={NAV_THEME[colorScheme]}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      {children}
    </ThemeProvider>
  );
}
