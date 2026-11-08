import type { ReactNode } from "react";

import { ThemeSwitcher } from "./theme-switcher";

export function NonWorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <div
        className="fixed top-4 right-4 z-40 rounded-lg bg-popover shadow-surface"
        data-theme-control
      >
        <ThemeSwitcher />
      </div>
    </>
  );
}
