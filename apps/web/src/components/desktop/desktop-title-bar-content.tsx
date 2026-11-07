import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const DesktopTitleBarContext = createContext<HTMLElement | null | undefined>(undefined);

export function DesktopTitleBarContent({ children }: { children: ReactNode }) {
  const target = useContext(DesktopTitleBarContext);
  if (target === undefined) return children;
  return target ? createPortal(children, target) : null;
}
