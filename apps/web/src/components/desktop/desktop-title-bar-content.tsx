import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { DesktopTitleBarContext } from "./desktop-title-bar-context";

export function DesktopTitleBarContent({
  children,
  position = "center",
}: {
  children: ReactNode;
  position?: "center" | "end";
}) {
  const targets = useContext(DesktopTitleBarContext);
  if (!targets) return children;
  const target = targets[position];
  return target ? createPortal(children, target) : null;
}
