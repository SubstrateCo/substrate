import type { ReactNode } from "react";

import { ThemeControl } from "./theme-control";

export function NonWorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <div className="fixed top-4 right-4 z-40" data-theme-control>
        <ThemeControl iconOnly />
      </div>
    </>
  );
}
