import { PendingButton } from "@/components/feedback/pending-button";

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
      className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-sm text-muted-foreground"
    >
      <span>You're not in this channel. Join or post to add it to your sidebar.</span>
      {error && (
        <span role="alert" className="text-destructive">
          {error.message}
        </span>
      )}
      <PendingButton
        size="sm"
        variant="outline"
        pending={pending}
        pendingLabel="Joining"
        onClick={onJoin}
      >
        Join channel
      </PendingButton>
    </div>
  );
}
