import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { Hash } from "lucide-react";

export function LeftChannelNotice({
  pending,
  error,
  onJoin,
}: {
  pending: boolean;
  error?: Error | null;
  onJoin: () => void;
}) {
  return (
    <div
      role="status"
      className="mx-3 mb-1 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
    >
      <Hash aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        You’re not in this channel. Join it, or post a message, to add it to your sidebar.
      </span>
      {error && (
        <span role="alert" className="text-destructive">
          {actionErrorMessage(error, "Couldn't join this channel. Try again.")}
        </span>
      )}
      <PendingButton size="sm" pending={pending} pendingLabel="Joining" onClick={onJoin}>
        Join channel
      </PendingButton>
    </div>
  );
}
