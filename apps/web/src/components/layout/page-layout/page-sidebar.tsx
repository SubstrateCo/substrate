import { useState, type ComponentProps, type ReactNode } from "react";

import { ResizableHandle, ResizablePanel } from "../../ui/resizable";
import { panelId, usePageLayout } from "./page-layout-context";
import { readPaneWidth } from "./pane-width";
import { cn } from "cn";

// Leading pane. Every sidebar has the same default, minimum, and maximum width.
const width = { default: 240, min: 180, max: 360 };

export function PageSidebar({
  className,
  "aria-label": label,
  ...props
}: ComponentProps<"aside"> & { "aria-label": string }) {
  const layout = usePageLayout("PageSidebar");
  const [saved] = useState(() => readPaneWidth(layout.id, "sidebar"));
  return (
    <>
      <ResizablePanel
        id={panelId(layout.id, "sidebar")}
        elementRef={(element) => layout.registerPane("sidebar", element)}
        defaultSize={saved ?? width.default}
        minSize={width.min}
        maxSize={width.max}
        groupResizeBehavior="preserve-pixel-size"
      >
        <aside
          data-slot="page-sidebar"
          aria-label={label}
          className={cn(
            "flex h-full min-h-0 w-full min-w-0 flex-col bg-sidebar text-sidebar-foreground",
            layout.mobileView === undefined && "max-md:h-auto max-md:shrink-0 max-md:border-b",
            layout.mobileView === "sidebar" && "max-md:h-auto max-md:flex-1",
            layout.mobileView === "content" && "max-md:hidden",
            className,
          )}
          {...props}
        />
      </ResizablePanel>
      <ResizableHandle
        aria-label={`Resize ${label.toLowerCase()} sidebar`}
        className="max-md:hidden"
      />
    </>
  );
}

export function PageSidebarHeader({
  title,
  actions,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="page-sidebar-header"
      className={cn("flex h-12 shrink-0 items-center justify-between gap-2 px-4", className)}
    >
      <h1 className="min-w-0 truncate text-sm font-semibold">{title}</h1>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

export function PageSidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="page-sidebar-content"
      className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto px-2 py-3", className)}
      {...props}
    />
  );
}
