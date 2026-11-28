import { useState } from "react";

import { leaveConsequence } from "./leave-consequence";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { SelectField } from "@/components/forms/select-field";

type OwnerCopyInput = { name: string; leaveLabel: string; publicChannel: boolean };

const ownerCopy: Record<
  "transfer" | "leave",
  (input: OwnerCopyInput) => { title: string; description: string; confirm: string }
> = {
  transfer: ({ name }) => ({
    title: `Change the owner of ${name}`,
    description: "The new owner can add people, change the owner, and delete the conversation.",
    confirm: "Change owner",
  }),
  leave: ({ name, leaveLabel, publicChannel }) => ({
    title: `Leave ${name}?`,
    description: `You own this conversation, so choose who owns it after you leave. ${leaveConsequence(publicChannel)}`,
    confirm: leaveLabel,
  }),
};

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
  leaveLabel?: string;
  publicChannel?: boolean;
  candidates: { userId: string; name: string }[];
  pending: boolean;
  error?: Error | null;
  onConfirm: (userId: string) => void;
  onClose: () => void;
  onRestoreFocus?: () => void;
}) {
  const [owner, setOwner] = useState<string>();
  const copy = ownerCopy[mode]({ name, leaveLabel, publicChannel });
  return (
    <ConfirmDialog
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirm}
      destructive={mode === "leave"}
      confirmDisabled={!owner}
      status={owner ? "" : "Choose a new owner"}
      pending={pending}
      error={error}
      onConfirm={() => owner && onConfirm(owner)}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
    >
      <SelectField
        label="New owner"
        value={owner ?? ""}
        onChange={setOwner}
        placeholder="Choose a member"
        options={candidates.map((person) => ({ value: person.userId, label: person.name }))}
      />
    </ConfirmDialog>
  );
}
