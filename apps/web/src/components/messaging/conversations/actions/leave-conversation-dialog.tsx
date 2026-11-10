import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

export function LeaveConversationDialog({
  name,
  publicChannel,
  lastMember,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  name: string;
  publicChannel: boolean;
  lastMember: boolean;
  pending: boolean;
  error?: Error | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (lastMember)
    return (
      <ConfirmDialog
        title={`You can't leave ${name}`}
        description="You are the last member. Delete the conversation instead."
        pendingLabel="Leaving"
        pending={false}
        onConfirm={onClose}
        onClose={onClose}
      />
    );
  return (
    <ConfirmDialog
      title={`Leave ${name}?`}
      description={
        publicChannel
          ? "It leaves your sidebar and you stop getting reply alerts. Mentions still reach you. You can still open it from links and search, and posting rejoins it."
          : "You lose access to its messages. A member who can manage it must add you back."
      }
      confirmLabel="Leave"
      pendingLabel="Leaving"
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
