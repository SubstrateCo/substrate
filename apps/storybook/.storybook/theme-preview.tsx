import { useEffect, useEffectEvent, type ReactNode } from "react";
import { ThemeProvider, useTheme } from "@startup-os/ui/theme/theme-provider";

export function ThemePreview({ dark, children }: { dark: boolean; children: ReactNode }) {
  return (
    <ThemeProvider storageKey="startup-os-storybook-theme">
      <PreviewTheme dark={dark}>{children}</PreviewTheme>
    </ThemeProvider>
  );
}

function PreviewTheme({ dark, children }: { dark: boolean; children: ReactNode }) {
  const { setTheme } = useTheme();
  const syncTheme = useEffectEvent(() => setTheme(dark ? "dark" : "light"));
  useEffect(() => {
    syncTheme();
  }, [dark]);
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
