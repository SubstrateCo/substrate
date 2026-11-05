import type { ReactNode } from "react";
import { ThemeProvider as NextThemeProvider } from "next-themes";
export { useTheme } from "next-themes";

export function ThemeProvider({
  children,
  storageKey = "startup-os-theme",
}: {
  children: ReactNode;
  storageKey?: string;
}) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey={storageKey}
    >
      {children}
    </NextThemeProvider>
  );
}
