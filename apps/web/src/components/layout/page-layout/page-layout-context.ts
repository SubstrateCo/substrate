import { createContext, useContext } from "react";

export type PagePane = "sidebar" | "content" | "aside";

export type PageLayoutContextValue = {
  id: string;
  depth: number;
  mobileView?: "sidebar" | "content";
  hasAside: boolean;
  asideCovers: boolean;
  setHasAside: (hasAside: boolean) => void;
  registerPane: (pane: PagePane, element: HTMLDivElement | null) => void;
};

export const PageLayoutContext = createContext<PageLayoutContextValue | null>(null);

export function usePageLayout(component: string) {
  const context = useContext(PageLayoutContext);
  if (!context) throw new Error(`${component} must be rendered inside a PageLayout.`);
  return context;
}

export function useAsideCovers() {
  return usePageLayout("useAsideCovers").asideCovers;
}

export function panelId(layoutId: string, pane: PagePane) {
  return `${layoutId}-${pane}`;
}
