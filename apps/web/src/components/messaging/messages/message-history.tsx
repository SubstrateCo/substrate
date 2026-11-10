import { PendingButton } from "../../feedback/pending-button";
import { ArrowDown } from "lucide-react";

type MessageHistoryState = {
  hasOlder: boolean;
  hasPrevious: boolean;
  pending?: "older" | "latest";
  onLatest: () => void;
};

/** Sits at the top of the timeline when more history exists. */
export function OlderMessages({
  replies = false,
  hasOlder,
  pending,
  onOlder,
}: Pick<MessageHistoryState, "hasOlder" | "pending"> & {
  replies?: boolean;
  onOlder: () => void;
}) {
  if (!hasOlder) return null;
  return (
    <div className="flex justify-center px-4 pb-2">
      <PendingButton
        type="button"
        size="xs"
        variant="disclosure"
        disabled={!!pending}
        pending={pending === "older"}
        pendingLabel={replies ? "Loading older replies." : "Loading older messages."}
        onClick={onOlder}
      >
        {replies ? "Older replies" : "Older messages"}
      </PendingButton>
    </div>
  );
}

/** Floats over the bottom of the timeline while it shows an older page. */
export function JumpToLatest({
  replies = false,
  hasPrevious,
  pending,
  onLatest,
}: Pick<MessageHistoryState, "hasPrevious" | "pending" | "onLatest"> & { replies?: boolean }) {
  if (!hasPrevious) return null;
  return (
    <span className="pointer-events-auto rounded-md shadow-floating">
      <PendingButton
        type="button"
        size="sm"
        variant="outline"
        disabled={!!pending}
        pending={pending === "latest"}
        pendingLabel={replies ? "Loading latest replies." : "Loading latest messages."}
        onClick={onLatest}
      >
        <ArrowDown aria-hidden="true" />
        {replies ? "Latest replies" : "Back to latest"}
      </PendingButton>
    </span>
  );
}
