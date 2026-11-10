import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

function impact(linkedWork?: number) {
  if (linkedWork === undefined) return "Checking linked work…";
  if (linkedWork === 0) return "No tasks or projects you can see link to it.";
  const noun = linkedWork === 1 ? "task or project links" : "tasks or projects link";
  return `${linkedWork} ${noun} to its messages. They stay, and their history shows the discussion was removed.`;
}

export function DeleteConversationDialog({
  name,
  linkedWork,
  pending,
  error,
  onConfirm,
  onClose,
  onRestoreFocus,
}: {
  name: string;
  linkedWork?: number;
  pending: boolean;
  error?: Error | null;
  onConfirm: () => void;
  onClose: () => void;
  onRestoreFocus?: () => void;
}) {
  return (
    <ConfirmDialog
      title={`Delete ${name}?`}
      description={
        <>
          This deletes every message, reply, and reaction for all members. Links to it stop working.{" "}
          {impact(linkedWork)} This cannot be undone.
        </>
      }
      confirmLabel="Delete conversation"
      pendingLabel="Deleting"
      destructive
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
    />
  );
}
