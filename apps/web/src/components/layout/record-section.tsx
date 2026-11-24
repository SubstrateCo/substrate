import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

/** Align the content of `Item size="xs"` with the record section's heading. */
export const recordRows = "-mx-2.5 grid gap-px";

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
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        <Heading
          level={3}
          variant="label"
          className="flex min-w-0 items-center gap-1.5 wrap-anywhere"
        >
          {title}
          {count !== undefined && <span className="font-normal tabular-nums">{count}</span>}
          {cue}
        </Heading>
        {actions && (
          <div className="ml-auto flex max-w-full min-w-0 flex-wrap items-center gap-0.5">
            {actions}
          </div>
        )}
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
      <dd className="flex min-w-0 flex-1 items-center text-sm wrap-anywhere [&>*]:max-w-full [&>*]:min-w-0">
        {children}
      </dd>
    </div>
  );
}

/** An unset property value. */
export function NotSet() {
  return <span className="text-muted-foreground">Not set</span>;
}
