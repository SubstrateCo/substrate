import { leaveConsequence } from "./leave-consequence";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

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
        title={`You can’t leave ${name}`}
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
      destructive
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
    />
  );
}
