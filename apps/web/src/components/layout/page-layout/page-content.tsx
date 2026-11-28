import type { ComponentProps } from "react";

import { panelId, usePageLayout } from "./page-layout-context";
import { ResizablePanel } from "@/components/ui/resizable";
import { cn } from "cn";

const minWidth = 320;

export function PageContent({ className, ...props }: ComponentProps<"div">) {
  const layout = usePageLayout("PageContent");
  const covered = layout.hasAside && layout.asideCovers;
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
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          layout.mobileView === "sidebar" && "max-md:hidden",
          className,
        )}
        {...props}
      />
    </ResizablePanel>
  );
}
