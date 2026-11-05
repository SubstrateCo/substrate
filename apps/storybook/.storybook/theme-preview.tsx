import { useEffect, type ReactNode } from "react";

export function ThemePreview({ dark, children }: { dark: boolean; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    return () => document.documentElement.classList.remove("dark");
  }, [dark]);
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
