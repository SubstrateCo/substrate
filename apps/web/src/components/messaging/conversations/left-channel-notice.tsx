import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { InlineNotice } from "@/components/feedback/inline-notice";
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
    <InlineNotice
      icon={Hash}
      className="mx-3 mb-1 w-auto"
      error={error && actionErrorMessage(error, "Couldn't join this channel. Try again.")}
      action={
        <PendingButton size="sm" pending={pending} onClick={onJoin}>
          Join channel
        </PendingButton>
      }
    >
      You’re not in this channel. Join it, or post a message, to add it to your sidebar.
    </InlineNotice>
  );
}
