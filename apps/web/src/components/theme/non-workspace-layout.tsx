import type { ReactNode } from "react";

import { ThemeControl } from "./theme-control";

export function NonWorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ThemeControl />
    </>
  );
}
