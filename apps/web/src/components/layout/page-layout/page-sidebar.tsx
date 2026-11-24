import { useState, type ComponentProps, type ReactNode } from "react";

import { ResizableHandle, ResizablePanel } from "../../ui/resizable";
import { PageHeader } from "../page-header";
import { panelId, usePageLayout } from "./page-layout-context";
import { readPaneWidth } from "./pane-width";
import { cn } from "cn";

// Leading pane. Every sidebar has the same default, minimum, and maximum width.
const width = { default: 240, min: 180, max: 360 };

export function PageSidebar({
  className,
  defaultWidth = width.default,
  "aria-label": label,
  ...props
}: ComponentProps<"aside"> & { "aria-label": string; defaultWidth?: number }) {
  const layout = usePageLayout("PageSidebar");
  const [saved] = useState(() => readPaneWidth(layout.id, "sidebar"));
  const covered = layout.hasAside && layout.asideCovers;
  return (
    <>
      <ResizablePanel
        id={panelId(layout.id, "sidebar")}
        elementRef={(element) => layout.registerPane("sidebar", element)}
        defaultSize={saved ?? defaultWidth}
        minSize={width.min}
        maxSize={width.max}
        groupResizeBehavior="preserve-pixel-size"
      >
        <aside
          data-slot="page-sidebar"
          aria-label={label}
          inert={covered || undefined}
          aria-hidden={covered || undefined}
          className={cn(
            "flex h-full min-h-0 w-full min-w-0 flex-col bg-sidebar text-sidebar-foreground",
            layout.mobileView === undefined &&
              "max-md:h-auto max-md:max-h-1/2 max-md:shrink-0 max-md:border-b",
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
  // The pane header without its border: the sidebar background already separates it.
  return (
    <PageHeader
      variant="pane"
      title={title}
      actions={actions}
      className={cn("border-b-0", className)}
    />
  );
}

/** The title of a group of sidebar rows: one `h-7` band. The rows follow at `gap-0.5`. */
export function PageSidebarGroupTitle({
  as: Title = "h2",
  className,
  ...props
}: ComponentProps<"h2"> & { as?: "h2" | "h3" | "p" }) {
  return (
    <Title
      data-slot="page-sidebar-group-title"
      className={cn(
        "flex h-7 min-w-0 items-center gap-2 truncate px-2 text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function PageSidebarContent({ className, ...props }: ComponentProps<"div">) {
  // Always follows PageSidebarHeader, so it needs no top padding.
  return (
    <div
      data-slot="page-sidebar-content"
      className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto px-2 pb-3", className)}
      {...props}
    />
  );
}
