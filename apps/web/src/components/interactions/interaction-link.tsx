import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

/** Open interaction details without leaving the current workspace app. */
export function InteractionLink({
  entityId,
  children,
  className,
  "aria-label": label,
}: {
  entityId: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Link
      to="."
      search={(previous) => ({ ...previous, interactionId: entityId })}
      className={className}
      aria-label={label}
    >
      {children}
    </Link>
  );
}
