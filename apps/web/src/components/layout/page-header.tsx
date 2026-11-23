import type { ReactNode } from "react";

import { Button } from "../ui/button";
import { Heading } from "../ui/heading";
import { cva } from "class-variance-authority";
import { cn } from "cn";
import { ArrowLeft } from "lucide-react";
import { Slot } from "radix-ui";

/**
 * Back navigation directly above a page header, on the title's left edge. `children` is the link
 * element (a router `Link`); its text follows the arrow.
 */
export function BackLink({ children }: { children: ReactNode }) {
  return (
    <Button variant="link" size="sm" className="-ml-1.5" asChild>
      <ArrowLeft aria-hidden="true" data-icon="inline-start" />
      <Slot.Slottable>{children}</Slot.Slottable>
    </Button>
  );
}

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
  leading,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** A kind icon before a pane title (Hash for a channel), or a record icon before a page title. */
  icon?: ReactNode;
  actions?: ReactNode;
  variant?: "page" | "pane";
  className?: string;
  leading?: ReactNode;
  children?: ReactNode;
}) {
  const page = variant === "page";
  return (
    <header data-slot="page-header" className={cn(pageHeaderVariants({ variant }), className)}>
      {leading}
      <div
        className={cn(
          "min-w-0",
          page ? "flex-1 basis-60 space-y-1" : "flex items-center gap-2",
          children && "max-w-1/3",
        )}
      >
        <Heading
          level={1}
          variant={page ? "page" : "title"}
          className={cn(
            "min-w-0",
            page
              ? cn(
                  "wrap-break-word",
                  // The caller sizes a page icon, such as a size-6 project image.
                  icon && "flex items-center gap-2",
                )
              : "flex items-center gap-2 truncate [&_svg]:size-4 [&_svg]:shrink-0",
          )}
        >
          {icon}
          <span className={page ? "min-w-0" : "truncate"}>{title}</span>
        </Heading>
        {page && description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="min-w-0 flex-1">{children}</div>}
      {actions && (
        <div className={cn("flex shrink-0 items-center", page ? "gap-2" : "gap-0.5")}>
          {actions}
        </div>
      )}
    </header>
  );
}
