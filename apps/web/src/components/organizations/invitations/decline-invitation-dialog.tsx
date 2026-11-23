import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

export function DeclineInvitationDialog({
  organizationName,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  organizationName?: string;
  pending: boolean;
  error: Error | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const name = organizationName || "this workspace";
  return (
    <ConfirmDialog
      destructive
      title={`Decline invitation to ${name}?`}
      description="You won’t join this workspace. To join later, ask the owner for a new invitation."
      confirmLabel="Decline invitation"
      pendingLabel="Decline invitation"
      pending={pending}
      error={error}
      errorDescription="We couldn’t decline this invitation. Please try again."
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
