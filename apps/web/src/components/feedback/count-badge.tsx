import type { ReactNode } from "react";

import { cn } from "cn";

export function CountBadge({
  className,
  children,
  ...props
}: {
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-hidden"?: boolean;
}) {
  return (
    <span
      className={cn(
        // oxlint-disable-next-line design/no-decorative-class -- An unread count.
        "inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs leading-none font-semibold text-primary-foreground tabular-nums",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
