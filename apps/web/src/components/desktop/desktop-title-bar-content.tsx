import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { DesktopTitleBarContext } from "./desktop-title-bar-context";

export function DesktopTitleBarContent({ children }: { children: ReactNode }) {
  const target = useContext(DesktopTitleBarContext);
  if (target === undefined) return children;
  return target ? createPortal(children, target) : null;
}
