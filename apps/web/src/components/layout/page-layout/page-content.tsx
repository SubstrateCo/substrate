import type { ComponentProps } from "react";

import { ResizablePanel } from "../../ui/resizable";
import { panelId, usePageLayout } from "./page-layout-context";
import { useMediaQuery } from "./use-media-query";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

// Main pane. It takes the space the sidebar and aside leave, down to a shared minimum.
const minWidth = 320;

const pageContentVariants = cva("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", {
  variants: {
    padding: {
      default: "p-4 sm:p-6",
      none: "",
    },
  },
  defaultVariants: { padding: "none" },
});

export function PageContent({
  className,
  padding,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof pageContentVariants>) {
  const layout = usePageLayout("PageContent");
  const wide = useMediaQuery("(min-width: 1024px)");
  // Below `lg` the aside covers the content, so the content must not take focus or be read.
  const covered = layout.hasAside && !wide;
  return (
    <ResizablePanel
      id={panelId(layout.id, "content")}
      elementRef={(element) => layout.registerPane("content", element)}
      minSize={minWidth}
      className="flex min-h-0 min-w-0 flex-col"
    >
      <div
        data-slot="page-content"
        data-page-outlet={layout.depth === 0 ? "" : undefined}
        inert={covered || undefined}
        aria-hidden={covered || undefined}
        className={cn(
          pageContentVariants({ padding }),
          layout.mobileView === "sidebar" && "max-md:hidden",
          className,
        )}
        {...props}
      />
    </ResizablePanel>
  );
}
