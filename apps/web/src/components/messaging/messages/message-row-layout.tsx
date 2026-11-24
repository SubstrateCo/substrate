import type { ReactNode } from "react";

import { cn } from "cn";

export function MessageRowLayout({
  avatar,
  byline,
  children,
  toolbar,
  grouped = false,
  highlighted = false,
  label,
}: {
  avatar: ReactNode;
  byline?: ReactNode;
  children: ReactNode;
  toolbar?: ReactNode;
  grouped?: boolean;
  highlighted?: boolean;
  label?: string;
}) {
  return (
    <article
      aria-label={label}
      className={cn(
        "group/message relative flex w-full gap-2.5 px-4 hover:bg-row-hover has-data-[state=open]:bg-row-hover",
        grouped ? "py-0.5" : "pt-2 pb-0.5",
        highlighted &&
          "bg-row-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary hover:bg-row-selected",
      )}
    >
      {avatar}
      <div className="min-w-0 flex-1">
        {byline && <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">{byline}</div>}
        {children}
        {toolbar}
      </div>
    </article>
  );
}
