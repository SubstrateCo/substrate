import { createContext } from "react";

export const DesktopTitleBarContext = createContext<
  | {
      center: HTMLElement | null;
      end: HTMLElement | null;
    }
  | undefined
>(undefined);
