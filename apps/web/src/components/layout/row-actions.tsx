import type { MouseEventHandler, ReactNode } from "react";

import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "cn";

/**
 * The icon actions of a list row: edit, delete, remove. They show when the pointer is over the
 * row, when focus is inside it, and while one of them has a menu open; touch screens always show
 * them. The row must have the `group/row` class. Labelled buttons, such as "Approve", stay outside
 * and visible.
 */
export function RowActions({
  label,
  className,
  children,
}: {
  /** Names the group, such as "Actions for Weekly summary". */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-aria-expanded:opacity-100 motion-reduce:transition-none pointer-coarse:opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One icon button of a row, with a tooltip that says what it does. */
export function RowAction({
  label,
  destructive = false,
  disabled,
  onClick,
  children,
}: {
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant={destructive ? "destructive-ghost" : "ghost"}
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
