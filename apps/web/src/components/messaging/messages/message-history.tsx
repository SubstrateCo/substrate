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
  label = "Older messages",
  hasOlder,
  pending,
  onOlder,
}: Pick<MessageHistoryState, "hasOlder" | "pending"> & {
  label?: string;
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
        onClick={onOlder}
      >
        {label}
      </PendingButton>
    </div>
  );
}

/** Floats over the bottom of the timeline while it shows an older page. */
export function JumpToLatest({
  label = "Back to latest",
  hasPrevious,
  pending,
  onLatest,
}: Pick<MessageHistoryState, "hasPrevious" | "pending" | "onLatest"> & { label?: string }) {
  if (!hasPrevious) return null;
  return (
    <span className="pointer-events-auto rounded-md shadow-floating">
      <PendingButton
        type="button"
        size="sm"
        variant="outline"
        disabled={!!pending}
        pending={pending === "latest"}
        onClick={onLatest}
      >
        <ArrowDown aria-hidden="true" />
        {label}
      </PendingButton>
    </span>
  );
}
