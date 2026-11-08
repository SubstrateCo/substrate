import { useState } from "react";

import { ConfirmDialog } from "./confirm-dialog";
import { OwnerSelect } from "./owner-select";

// "leave" is shown to the owner, who must hand over the conversation before leaving it.
export function OwnerDialog({
  mode,
  name,
  candidates,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  mode: "transfer" | "leave";
  name: string;
  candidates: { userId: string; name: string }[];
  pending: boolean;
  error?: Error | null;
  onConfirm: (userId: string) => void;
  onClose: () => void;
}) {
  const [owner, setOwner] = useState<string>();
  const leaving = mode === "leave";
  return (
    <ConfirmDialog
      title={leaving ? `Leave ${name}?` : `Change the owner of ${name}`}
      description={
        leaving
          ? "You own this conversation. Choose a member to own it after you leave."
          : "The new owner can add people, change the owner, and delete the conversation."
      }
      confirmLabel={leaving ? "Leave" : "Change owner"}
      pendingLabel={leaving ? "Leaving" : "Saving"}
      confirmDisabled={!owner}
      pending={pending}
      error={error}
      onConfirm={() => owner && onConfirm(owner)}
      onClose={onClose}
    >
      <OwnerSelect candidates={candidates} value={owner} onChange={setOwner} />
    </ConfirmDialog>
  );
}
