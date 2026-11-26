import { createContext, useContext } from "react";

export const PageSheetContext = createContext<{ onClose: () => void; label: string } | null>(null);
export const PageSheetSuspendedContext = createContext(false);

export function usePageSheet() {
  return useContext(PageSheetContext);
}
