import { themes } from "@substrate/design-tokens";

import { DarkTheme, DefaultTheme, type Theme } from "expo-router/react-navigation";

export type ColorScheme = keyof typeof themes;

export const THEME = themes;

function navigationTheme(base: Theme, scheme: ColorScheme): Theme {
  const colors = THEME[scheme];
  return {
    ...base,
    colors: {
      background: colors.background,
      border: colors.border,
      card: colors.card,
      notification: colors.destructive,
      primary: colors.primary,
      text: colors.foreground,
    },
  };
}

export const NAV_THEME: Record<ColorScheme, Theme> = {
  light: navigationTheme(DefaultTheme, "light"),
  dark: navigationTheme(DarkTheme, "dark"),
};
