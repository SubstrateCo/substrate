import { createContext, useContext } from "react";

export type PagePane = "sidebar" | "content" | "aside";

export type PageLayoutContextValue = {
  id: string;
  // Nested layouts have depth > 0. Only the outermost content is the page outlet.
  depth: number;
  mobileView?: "sidebar" | "content";
  hasAside: boolean;
  /** Below `lg` an aside covers the content instead of sitting beside it. */
  asideCovers: boolean;
  setHasAside: (hasAside: boolean) => void;
  // Panes register their panel element so saved widths use the real available size.
  registerPane: (pane: PagePane, element: HTMLDivElement | null) => void;
};

export const PageLayoutContext = createContext<PageLayoutContextValue | null>(null);

export function usePageLayout(component: string) {
  const context = useContext(PageLayoutContext);
  if (!context) throw new Error(`${component} must be rendered inside a PageLayout.`);
  return context;
}

/** Whether an aside in this layout covers the content, so it should take focus when it opens. */
export function useAsideCovers() {
  return usePageLayout("useAsideCovers").asideCovers;
}

export function panelId(layoutId: string, pane: PagePane) {
  return `${layoutId}-${pane}`;
}
