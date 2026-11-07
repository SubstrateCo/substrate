import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { applyTheme, createThemeStore } from "./theme-store";

type ThemeContextValue = ReturnType<ReturnType<typeof createThemeStore>["getSnapshot"]> & {
  resolvedTheme: "light" | "dark";
  setTheme: ReturnType<typeof createThemeStore>["setTheme"];
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createThemeStore("startup-os-theme"));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const resolvedTheme = snapshot.theme === "system" ? snapshot.systemTheme : snapshot.theme;
  useLayoutEffect(() => applyTheme(resolvedTheme), [resolvedTheme]);
  const value = useMemo(
    () => ({
      ...snapshot,
      resolvedTheme,
      setTheme: store.setTheme,
    }),
    [snapshot, resolvedTheme, store],
  );
  return <ThemeContext value={value}>{children}</ThemeContext>;
}
