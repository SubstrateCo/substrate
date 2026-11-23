import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

/** Open contact details without leaving the current workspace app. */
export function ContactLink({
  entityId,
  children,
  className,
}: {
  entityId: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to="."
      search={(previous) => ({ ...previous, contactId: entityId })}
      className={className}
    >
      {children}
    </Link>
  );
}
