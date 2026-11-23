import type { ReactNode } from "react";

import { cva } from "class-variance-authority";
import { cn } from "cn";

const pageHeaderVariants = cva("flex shrink-0 justify-between gap-x-4", {
  variants: {
    variant: {
      // Full pages: Notifications, Settings, a project. Sits inside the page's p-6 inset.
      page: "flex-wrap items-start gap-y-2",
      // Panes and sidebars: one 48px line with a bottom border and icon-sm tools.
      pane: "h-12 items-center gap-2 border-b px-4",
    },
  },
  defaultVariants: { variant: "page" },
});

/**
 * The title row of a page or pane: title, an optional description, and actions on the right.
 * Pane actions are ghost `icon-sm` buttons with tooltips; page actions may be labelled buttons.
 */
export function PageHeader({
  title,
  description,
  icon,
  actions,
  variant = "page",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** A kind icon before a pane title (Hash for a channel), or a record icon before a page title. */
  icon?: ReactNode;
  actions?: ReactNode;
  variant?: "page" | "pane";
  className?: string;
}) {
  const page = variant === "page";
  return (
    <header data-slot="page-header" className={cn(pageHeaderVariants({ variant }), className)}>
      <div
        className={cn("min-w-0", page ? "flex-1 basis-60 space-y-1" : "flex items-center gap-2")}
      >
        <h1
          className={cn(
            "min-w-0 font-semibold",
            page
              ? cn(
                  "text-xl tracking-tight wrap-break-word",
                  // The caller sizes a page icon, such as a size-6 project image.
                  icon && "flex items-center gap-2",
                )
              : "flex items-center gap-2 truncate text-sm [&_svg]:size-4 [&_svg]:shrink-0",
          )}
        >
          {icon}
          <span className={page ? "min-w-0" : "truncate"}>{title}</span>
        </h1>
        {page && description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && (
        <div className={cn("flex shrink-0 items-center", page ? "gap-2" : "gap-0.5")}>
          {actions}
        </div>
      )}
    </header>
  );
}
