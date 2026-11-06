import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { applyTheme, createThemeStore } from "./theme-store";

type ThemeContextValue = ReturnType<ReturnType<typeof createThemeStore>["getSnapshot"]> & {
  resolvedTheme: "light" | "dark";
  setTheme: ReturnType<typeof createThemeStore>["setTheme"];
  themes: string[];
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}

export function ThemeProvider({
  children,
  storageKey = "startup-os-theme",
}: {
  children: ReactNode;
  storageKey?: string;
}) {
  const store = useMemo(() => createThemeStore(storageKey), [storageKey]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const resolvedTheme = snapshot.theme === "system" ? snapshot.systemTheme : snapshot.theme;
  useLayoutEffect(() => applyTheme(resolvedTheme), [resolvedTheme]);
  const value = useMemo(
    () => ({
      ...snapshot,
      resolvedTheme,
      setTheme: store.setTheme,
      themes: ["light", "dark", "system"],
    }),
    [snapshot, resolvedTheme, store],
  );
  return <ThemeContext value={value}>{children}</ThemeContext>;
}
