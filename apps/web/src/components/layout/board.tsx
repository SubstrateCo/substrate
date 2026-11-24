import { useId, type ComponentProps, type ReactNode, type Ref } from "react";

import { ContentNotice } from "../feedback/content-notice";
import { Button } from "../ui/button";
import { Heading } from "../ui/heading";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "cn";
import { Plus } from "lucide-react";

/** A row of board columns. The columns stretch to the board's height. */
export function Board({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "flex min-h-0 max-w-full min-w-0 flex-1 gap-4 overflow-x-auto overscroll-x-contain",
        className,
      )}
      {...props}
    />
  );
}

/** One board column: a header with the name and count, then a list of `BoardCard`s. */
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
  /** The add button's name, such as "Add task to In progress". */
  addLabel?: string;
  /** Names the card list, such as "In progress tasks". */
  listLabel: string;
  /** The muted line for a column with no cards. Pass it only then. */
  empty?: string;
  /** A dragged card is over the column. */
  isOver?: boolean;
  children?: ReactNode;
}) {
  const labelId = useId();
  return (
    <section
      ref={ref}
      aria-labelledby={labelId}
      className={cn(
        "flex min-h-0 max-w-72 min-w-60 flex-1 flex-col gap-3 rounded-lg bg-inset p-3 sm:min-w-48",
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

/**
 * A board card. Put `boardCardTarget` on its title link, or use `Pressable focus="stretched"` for a
 * title button, so the whole card opens it.
 */
export function BoardCard({
  ref,
  selected = false,
  overlay = false,
  className,
  children,
}: {
  ref?: Ref<HTMLLIElement>;
  selected?: boolean;
  /** The copy that follows the pointer while a card is dragged. */
  overlay?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const classes = cn(
    "relative flex flex-col gap-2 rounded-lg border bg-surface p-3 text-sm shadow-surface transition-colors",
    overlay ? "shadow-raised" : "hover:bg-row-hover",
    selected && "bg-row-selected text-row-selected-foreground hover:bg-row-selected",
    className,
  );
  if (overlay) return <div className={classes}>{children}</div>;
  return (
    <li ref={ref} className={classes}>
      {children}
    </li>
  );
}

/** The card's title link or button. It stretches over the card; controls inside sit above it with `relative`. */
export const boardCardTarget =
  "font-medium wrap-break-word outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring/50";
