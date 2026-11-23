import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

export function RecordArchive({
  name,
  archived,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  name: string;
  archived: boolean;
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      title={`${archived ? "Restore" : "Archive"} ${name}?`}
      description={
        archived
          ? "This record will appear in active lists and customer pickers again. Its access does not change."
          : "Hide this record from active lists and new customer links. History stays available. Related contacts, deals, and tasks are not archived or completed."
      }
      confirmLabel={archived ? "Restore record" : "Archive record"}
      pending={pending}
      error={error}
      errorDescription="Couldn’t change this record’s archive state. Try again."
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
