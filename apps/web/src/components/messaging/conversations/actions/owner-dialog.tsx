import { useState } from "react";

import { leaveConsequence } from "./leave-consequence";
import { OwnerSelect } from "./owner-select";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

// "leave" is shown to the owner, who must hand over the conversation before leaving it.
// Handing it over alone is a plain primary action; leaving is destructive like any other leave.
export function OwnerDialog({
  mode,
  name,
  leaveLabel = "Leave conversation",
  publicChannel = false,
  candidates,
  pending,
  error,
  onConfirm,
  onClose,
  onRestoreFocus,
}: {
  mode: "transfer" | "leave";
  name: string;
  /** "Leave channel" or "Leave group". Only used when leaving. */
  leaveLabel?: string;
  /** Whether people can still open the conversation after the owner leaves. */
  publicChannel?: boolean;
  candidates: { userId: string; name: string }[];
  pending: boolean;
  error?: Error | null;
  onConfirm: (userId: string) => void;
  onClose: () => void;
  onRestoreFocus?: () => void;
}) {
  const [owner, setOwner] = useState<string>();
  const leaving = mode === "leave";
  return (
    <ConfirmDialog
      title={leaving ? `Leave ${name}?` : `Change the owner of ${name}`}
      description={
        leaving
          ? `You own this conversation, so choose who owns it after you leave. ${leaveConsequence(publicChannel)}`
          : "The new owner can add people, change the owner, and delete the conversation."
      }
      confirmLabel={leaving ? leaveLabel : "Change owner"}
      pendingLabel={leaving ? "Leaving…" : "Saving…"}
      destructive={leaving}
      confirmDisabled={!owner}
      status={owner ? "" : "Choose a new owner"}
      pending={pending}
      error={error}
      onConfirm={() => owner && onConfirm(owner)}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
    >
      <OwnerSelect candidates={candidates} value={owner} onChange={setOwner} />
    </ConfirmDialog>
  );
}
