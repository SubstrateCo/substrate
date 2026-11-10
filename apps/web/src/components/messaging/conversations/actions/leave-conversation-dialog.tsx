import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

/** What leaving costs the person, which depends on whether anyone can still open it. */
export function leaveConsequence(publicChannel: boolean) {
  return publicChannel
    ? "It leaves your sidebar and you stop getting reply alerts. Mentions still reach you. You can still open it from links and search, and posting rejoins it."
    : "You lose access to its messages. A member who can manage it must add you back.";
}

export function LeaveConversationDialog({
  name,
  leaveLabel,
  publicChannel,
  lastMember,
  pending,
  error,
  onConfirm,
  onClose,
  onRestoreFocus,
}: {
  name: string;
  /** "Leave channel" or "Leave group": the button names what the person leaves. */
  leaveLabel: string;
  publicChannel: boolean;
  lastMember: boolean;
  pending: boolean;
  error?: Error | null;
  onConfirm: () => void;
  onClose: () => void;
  onRestoreFocus?: () => void;
}) {
  if (lastMember)
    return (
      <ConfirmDialog
        title={`You can't leave ${name}`}
        description="You are the last member. Delete the conversation instead."
        onClose={onClose}
        onRestoreFocus={onRestoreFocus}
      />
    );
  return (
    <ConfirmDialog
      title={`Leave ${name}?`}
      description={leaveConsequence(publicChannel)}
      confirmLabel={leaveLabel}
      pendingLabel="Leaving…"
      destructive
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
    />
  );
}
