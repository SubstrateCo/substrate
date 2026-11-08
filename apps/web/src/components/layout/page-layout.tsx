import type { ComponentProps, ReactNode } from "react";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

// Standard app page frame: an optional sidebar beside the main content.
// Pages control the look only through these variants, so every app sidebar matches.

export function PageLayout({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      data-slot="page-layout"
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row", className)}
      {...props}
    />
  );
}

const pageSidebarVariants = cva(
  "flex min-h-0 min-w-0 shrink-0 flex-col bg-sidebar text-sidebar-foreground",
  {
    variants: {
      // "fixed" sets its own width. "fill" fills a parent that sets the width, such as a resizable panel.
      width: {
        fixed: "border-b md:h-full md:w-60 md:border-r md:border-b-0",
        fill: "h-full w-full",
      },
    },
    defaultVariants: { width: "fixed" },
  },
);

export function PageSidebar({
  className,
  width,
  ...props
}: ComponentProps<"aside"> & VariantProps<typeof pageSidebarVariants>) {
  return (
    <aside
      data-slot="page-sidebar"
      className={cn(pageSidebarVariants({ width }), className)}
      {...props}
    />
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
  return (
    <div
      data-slot="page-content"
      data-page-outlet
      className={cn(pageContentVariants({ padding }), className)}
      {...props}
    />
  );
}
