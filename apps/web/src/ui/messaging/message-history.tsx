import type { ReactNode } from "react";
import { PendingButton } from "../feedback/pending-button";
import { Spinner } from "../primitives/spinner";

export function MessageHistory({
  replies = false,
  hasOlder,
  hasPrevious,
  pending,
  onOlder,
  onLatest,
  children,
}: {
  replies?: boolean;
  hasOlder: boolean;
  hasPrevious: boolean;
  pending?: "older" | "latest" | "refresh";
  onOlder: () => void;
  onLatest: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2 px-4">
        {hasOlder && (
          <PendingButton
            type="button"
            size="xs"
            variant="ghost"
            disabled={!!pending}
            pending={pending === "older"}
            pendingLabel={replies ? "Loading older replies…" : "Loading older messages…"}
            onClick={onOlder}
          >
            {replies ? "Older replies" : "Older messages"}
          </PendingButton>
        )}
        {hasPrevious && (
          <PendingButton
            type="button"
            size="xs"
            variant="ghost"
            disabled={!!pending}
            pending={pending === "latest"}
            pendingLabel={replies ? "Loading latest replies…" : "Loading latest messages…"}
            onClick={onLatest}
          >
            {replies ? "Latest replies" : "Back to latest"}
          </PendingButton>
        )}
        {pending === "refresh" && (
          <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground">
            <Spinner aria-hidden="true" />
            {replies ? "Refreshing replies…" : "Refreshing messages…"}
          </span>
        )}
      </div>
      {children}
    </>
  );
}
