import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { ThemeContext } from "./theme-context";
import { applyTheme, createThemeStore } from "./theme-store";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createThemeStore("substrate-theme"));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const resolvedTheme = snapshot.theme === "system" ? snapshot.systemTheme : snapshot.theme;
  useLayoutEffect(() => applyTheme(resolvedTheme), [resolvedTheme]);
  const value = {
    ...snapshot,
    resolvedTheme,
    setTheme: store.setTheme,
  };
  return <ThemeContext value={value}>{children}</ThemeContext>;
}
