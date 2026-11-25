import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
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
      // Panes and sidebars: one 48px line with icon-sm tools.
      pane: "h-12 items-center gap-2 px-4",
    },
    // A pane header's bottom border. A sidebar header drops it: the sidebar background separates it.
    bordered: { true: "", false: "" },
  },
  compoundVariants: [{ variant: "pane", bordered: true, className: "border-b" }],
  defaultVariants: { variant: "page", bordered: true },
});

const pageHeaderTitleBlockVariants = cva("min-w-0", {
  variants: {
    variant: {
      page: "flex-1 basis-60 space-y-1",
      pane: "flex items-center gap-2",
    },
    withChildren: { true: "", false: "" },
  },
  compoundVariants: [
    { variant: "page", withChildren: true, className: "sm:max-w-1/3" },
    { variant: "pane", withChildren: true, className: "max-w-1/3" },
  ],
  defaultVariants: { variant: "page", withChildren: false },
});

const pageHeaderTitleVariants = cva("min-w-0", {
  variants: {
    variant: {
      page: "wrap-anywhere",
      pane: "flex items-center gap-2 truncate [&_svg]:size-4 [&_svg]:shrink-0",
    },
    withIcon: { true: "", false: "" },
  },
  compoundVariants: [
    // The caller sizes a page icon, such as a size-6 project image.
    { variant: "page", withIcon: true, className: "flex items-center gap-2" },
  ],
  defaultVariants: { variant: "page", withIcon: false },
});

const pageHeaderTitleTextVariants = cva("", {
  variants: {
    variant: {
      page: "min-w-0",
      pane: "truncate",
    },
  },
  defaultVariants: { variant: "page" },
});

const pageHeaderChildrenVariants = cva("min-w-0 flex-1", {
  variants: {
    variant: {
      page: "basis-full sm:basis-0",
      pane: "",
    },
  },
  defaultVariants: { variant: "page" },
});

const pageHeaderActionsVariants = cva("flex items-center", {
  variants: {
    variant: {
      page: "max-w-full min-w-0 flex-wrap gap-2",
      pane: "shrink-0 gap-0.5",
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
  bordered = true,
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
  /** A pane header's bottom border; `PageSidebarHeader` turns it off. */
  bordered?: boolean;
  className?: string;
  leading?: ReactNode;
  children?: ReactNode;
}) {
  const page = variant === "page";
  return (
    <header
      data-slot="page-header"
      className={cn(pageHeaderVariants({ variant, bordered }), className)}
    >
      {leading}
      <div className={pageHeaderTitleBlockVariants({ variant, withChildren: Boolean(children) })}>
        <Heading
          level={1}
          variant={page ? "page" : "title"}
          className={pageHeaderTitleVariants({ variant, withIcon: Boolean(icon) })}
        >
          {icon}
          <span className={pageHeaderTitleTextVariants({ variant })}>{title}</span>
        </Heading>
        {page && description && (
          <p className="text-sm wrap-anywhere text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className={pageHeaderChildrenVariants({ variant })}>{children}</div>}
      {actions && <div className={pageHeaderActionsVariants({ variant })}>{actions}</div>}
    </header>
  );
}
