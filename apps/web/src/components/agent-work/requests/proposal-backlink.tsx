import { CornerUpLeft } from "lucide-react";

/** Under a message an approved proposal created: where the owner approved it. */
export function ProposalBacklink({ href, label }: { href?: string; label?: string }) {
  return (
    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <CornerUpLeft aria-hidden="true" className="size-3.5 shrink-0" />
      <span>You approved this</span>
      {href && label ? (
        <a href={href} className="min-w-0 truncate font-medium text-primary hover:underline">
          from {label}
        </a>
      ) : (
        <span>from a conversation you can’t open</span>
      )}
    </p>
  );
}
