import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

/** The list of rows in a record section. Rows hang 8px into the gutter so their text aligns. */
export const recordRows = "-mx-2 grid gap-px";

/** One row in `recordRows`: a link, button, or item that fills the row, 32px for one line of text. */
export const recordRow =
  "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * A section of a record sheet or aside: a 28px title row (muted title, count, cues, actions on the
 * right), an optional helper line, then the content. A disclosure trigger can be the `title`.
 */
export function RecordSection({
  title,
  count,
  cue,
  description,
  actions,
  className,
  children,
  ...section
}: {
  title: ReactNode;
  count?: ReactNode;
  cue?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
} & Omit<ComponentProps<"section">, "title">) {
  return (
    <section className={cn("grid min-w-0 content-start gap-2", className)} {...section}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {title}
          {count !== undefined && <span className="font-normal tabular-nums">{count}</span>}
          {cue}
        </h3>
        {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {children}
    </section>
  );
}

/** The ghost icon action on a section's title row, with a tooltip that matches its label. */
export function RecordSectionAction({
  label,
  children,
  ...button
}: { label: string } & Omit<ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label} {...button}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Side-by-side record properties: a muted label column and the values. */
export function PropertyList({ className, ...props }: ComponentProps<"dl">) {
  return <dl className={cn("grid", className)} {...props} />;
}

export function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      <dt className="w-24 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center text-sm wrap-break-word">{children}</dd>
    </div>
  );
}

/** An unset property value. */
export function NotSet() {
  return <span className="text-muted-foreground">Not set</span>;
}
