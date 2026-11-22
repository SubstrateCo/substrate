import { useLayoutEffect, useState, type ComponentProps } from "react";

import { ResizableHandle, ResizablePanel } from "../../ui/resizable";
import { panelId, usePageLayout } from "./page-layout-context";
import { readPaneWidth } from "./pane-width";
import { cn } from "cn";

// Trailing pane, such as a thread. Below `lg` it covers the content instead of sitting beside it.
const width = { default: "40%", min: 300, max: "65%" };

export function PageAside({
  className,
  overlay = false,
  animate = true,
  "aria-label": label,
  ...props
}: ComponentProps<"aside"> & { "aria-label": string; overlay?: boolean; animate?: boolean }) {
  const layout = usePageLayout("PageAside");
  const [saved] = useState(() => readPaneWidth(layout.id, "aside"));
  const { setHasAside } = layout;
  useLayoutEffect(() => {
    setHasAside(true);
    return () => setHasAside(false);
  }, [setHasAside]);
  if (overlay) {
    return (
      <aside
        data-slot="page-aside"
        aria-label={label}
        className={cn(
          "absolute inset-y-0 right-0 z-10 flex w-full min-w-0 flex-col border-l bg-surface shadow-raised lg:w-2/5 lg:max-w-xl",
          animate &&
            "duration-200 ease-out motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2",
          className,
        )}
        {...props}
      />
    );
  }
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
            // The pane's content eases in from the right; the pane's width itself does not animate.
            "absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col bg-surface shadow-raised lg:static lg:flex-1 lg:shadow-none",
            animate &&
              "duration-200 ease-out motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2",
            className,
          )}
          {...props}
        />
      </ResizablePanel>
    </>
  );
}
