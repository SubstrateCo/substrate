import { ThemeSwitcher } from "./theme-switcher";

export function ThemeControl() {
  return (
    <div
      className="fixed right-4 top-4 z-40 rounded-lg bg-popover shadow-surface"
      data-theme-control
    >
      <ThemeSwitcher />
    </div>
  );
}
