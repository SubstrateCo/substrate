import { createContext, useContext } from "react";

import type { createThemeStore } from "./theme-store";

type ThemeContextValue = ReturnType<ReturnType<typeof createThemeStore>["getSnapshot"]> & {
  resolvedTheme: "light" | "dark";
  setTheme: ReturnType<typeof createThemeStore>["setTheme"];
};

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
