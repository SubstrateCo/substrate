import { useId, type ComponentProps, type ReactNode, type Ref } from "react";

import { ContentNotice } from "../feedback/content-notice";
import { rowStateVariants } from "./row-state";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";
import { Plus } from "lucide-react";

export function Board({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "flex min-h-0 w-full max-w-full min-w-0 flex-1 gap-4 overflow-x-auto overscroll-x-contain",
        className,
      )}
      {...props}
    />
  );
}

export function BoardColumn({
  ref,
  label,
  count,
  icon,
  onAdd,
  addLabel,
  listLabel,
  empty,
  isOver = false,
  children,
}: {
  ref?: Ref<HTMLElement>;
  label: ReactNode;
  count: ReactNode;
  icon?: ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  listLabel: string;
  empty?: string;
  isOver?: boolean;
  children?: ReactNode;
}) {
  const labelId = useId();
  return (
    <section
      ref={ref}
      aria-labelledby={labelId}
      className={cn(
        "flex min-h-0 min-w-64 flex-1 flex-col gap-3 rounded-lg bg-inset p-3",
        isOver && "bg-row-highlight ring-2 ring-ring/50",
      )}
    >
      <header className="flex h-6 shrink-0 items-center gap-2">
        {icon}
        <Heading level={2} id={labelId} className="min-w-0 flex-1 truncate">
          {label}
        </Heading>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
        {onAdd && addLabel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={addLabel} onClick={onAdd}>
                <Plus aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{addLabel}</TooltipContent>
          </Tooltip>
        )}
      </header>
      <ul
        aria-label={listLabel}
        className="-m-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1"
      >
        {children}
        {empty && (
          <li>
            <ContentNotice variant="inline" title={empty} />
          </li>
        )}
      </ul>
    </section>
  );
}

export function BoardCard({
  ref,
  selected = false,
  overlay = false,
  className,
  children,
}: {
  ref?: Ref<HTMLLIElement>;
  selected?: boolean;
  overlay?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const classes = cn(
    "relative flex min-w-0 shrink-0 flex-col gap-2 rounded-lg border bg-surface p-3 text-sm shadow-surface transition-colors",
    overlay && "shadow-raised",
    rowStateVariants({ selected, hover: !overlay }),
    className,
  );
  if (overlay) return <div className={classes}>{children}</div>;
  return (
    <li ref={ref} className={classes}>
      {children}
    </li>
  );
}

export const boardCardTarget =
  "font-medium wrap-break-word outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring/50";
