import { Link } from "@tanstack/react-router";

import type { RecordLink } from "@/lib/navigation/record-links";
import { CornerUpLeft } from "lucide-react";

export function ProposalBacklink({ link, label }: { link?: RecordLink; label?: string }) {
  return (
    <p className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <CornerUpLeft aria-hidden="true" className="size-3.5 shrink-0" />
      <span>You approved this</span>
      {link && label ? (
        <Link {...link} className="min-w-0 truncate font-medium text-primary hover:underline">
          from {label}
        </Link>
      ) : (
        <span>from a conversation you can’t open</span>
      )}
    </p>
  );
}
