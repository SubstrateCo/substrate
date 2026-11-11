import { useContext, useRef, useState, type ReactNode } from "react";

import { ResizablePanelGroup } from "../../ui/resizable";
import {
  PageLayoutContext,
  panelId,
  type PageLayoutContextValue,
  type PagePane,
} from "./page-layout-context";
import { writePaneWidth } from "./pane-width";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "cn";
import type { Layout, LayoutChangedMeta } from "react-resizable-panels";

// Standard app page frame: an optional sidebar, the main content, and an optional aside.
// The layout owns pane sizes, resizing, saved widths, and narrow-screen behavior,
// so every page behaves the same way.
//
// Below the breakpoint the panel group is removed from the box tree and the panes stack.
// The breakpoint is `md`, or `lg` when the layout has an aside.
// `mobileView` shows only one of the sidebar and content below `md`. Without it, they stack.

const savedPanes: PagePane[] = ["sidebar", "aside"];

export function PageLayout({
  id,
  "aria-label": label,
  mobileView,
  className,
  children,
}: {
  id: string;
  "aria-label": string;
  mobileView?: "sidebar" | "content";
  className?: string;
  children: ReactNode;
}) {
  const parent = useContext(PageLayoutContext);
  const [hasAside, setHasAside] = useState(false);
  const wide = useMediaQuery("(min-width: 1024px)");
  const panes = useRef(new Map<PagePane, HTMLDivElement>());
  const registerPane = (pane: PagePane, element: HTMLDivElement | null) => {
    if (element) panes.current.set(pane, element);
    else panes.current.delete(pane);
  };
  const context: PageLayoutContextValue = {
    id,
    depth: parent ? parent.depth + 1 : 0,
    mobileView,
    hasAside,
    asideCovers: !wide,
    setHasAside,
    registerPane,
  };
  const saveWidths = (layout: Layout, meta: LayoutChangedMeta) => {
    if (!meta.isUserInteraction) return;
    // Layout values are percentages of the combined panel widths, which a drag does not change.
    let available = 0;
    for (const element of panes.current.values()) available += element.offsetWidth;
    if (!available) return;
    for (const pane of savedPanes) {
      const key = panelId(id, pane);
      if (key in layout) writePaneWidth(id, pane, (layout[key] / 100) * available);
    }
  };
  return (
    <PageLayoutContext.Provider value={context}>
      <section
        data-slot="page-layout"
        aria-label={label}
        className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className)}
      >
        <ResizablePanelGroup
          id={`page-layout-${id}`}
          orientation="horizontal"
          onLayoutChanged={saveWidths}
          className={cn(
            "min-h-0 min-w-0 flex-1",
            hasAside
              ? "max-lg:contents! max-lg:*:data-panel:contents!"
              : "max-md:contents! max-md:*:data-panel:contents!",
          )}
        >
          {children}
        </ResizablePanelGroup>
      </section>
    </PageLayoutContext.Provider>
  );
}
