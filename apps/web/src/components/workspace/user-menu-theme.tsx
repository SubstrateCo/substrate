import { ThemeControl } from "@/components/theme/theme-control";

export function UserMenuTheme() {
  return (
    <div className="flex items-center justify-between gap-2 py-1 pr-1 pl-2">
      <span className="text-sm text-muted-foreground">Theme</span>
      <ThemeControl iconOnly />
    </div>
  );
}
