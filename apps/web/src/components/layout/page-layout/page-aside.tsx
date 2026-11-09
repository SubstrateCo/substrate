import { useLayoutEffect, useState, type ComponentProps } from "react";

import { ResizableHandle, ResizablePanel } from "../../ui/resizable";
import { panelId, usePageLayout } from "./page-layout-context";
import { readPaneWidth } from "./pane-width";
import { cn } from "cn";

// Trailing pane, such as a thread. Below `lg` it covers the content instead of sitting beside it.
const width = { default: "40%", min: 300, max: "65%" };

export function PageAside({
  className,
  "aria-label": label,
  ...props
}: ComponentProps<"aside"> & { "aria-label": string }) {
  const layout = usePageLayout("PageAside");
  const [saved] = useState(() => readPaneWidth(layout.id, "aside"));
  const { setHasAside } = layout;
  useLayoutEffect(() => {
    setHasAside(true);
    return () => setHasAside(false);
  }, [setHasAside]);
  return (
    <>
      <ResizableHandle aria-label={`Resize ${label.toLowerCase()}`} className="max-lg:hidden" />
      <ResizablePanel
        id={panelId(layout.id, "aside")}
        elementRef={(element) => layout.registerPane("aside", element)}
        defaultSize={saved ?? width.default}
        minSize={width.min}
        maxSize={width.max}
        groupResizeBehavior="preserve-pixel-size"
        className="flex min-h-0 min-w-0 flex-col"
      >
        <aside
          data-slot="page-aside"
          aria-label={label}
          className={cn(
            "absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col bg-surface shadow-raised lg:static lg:flex-1 lg:shadow-none",
            className,
          )}
          {...props}
        />
      </ResizablePanel>
    </>
  );
}
