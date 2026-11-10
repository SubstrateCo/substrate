import type { ReactNode } from "react";

import { cn } from "cn";

/** A small bordered label, such as "Agent" or "External", beside a name. */
export function Tag({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-xs text-muted-foreground", className)}>
      {children}
    </span>
  );
}
