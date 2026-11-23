import { backfillPastDays } from "@substrate/contracts/calendar";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

/** Confirms a backfill, which shares past meetings with the organization as interactions. */
export function BackfillDialog({
  calendarName,
  recordsInteractions,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  calendarName: string;
  recordsInteractions: boolean;
  pending: boolean;
  error: Error | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title={`Backfill ${calendarName}?`}
      description={
        recordsInteractions
          ? `Meetings from the last ${backfillPastDays} days will create contacts and interactions for their outside attendees. Every member of this organization can see them.`
          : `Meetings from the last ${backfillPastDays} days will appear in your calendar. “Create contacts and interactions” is off for this calendar, so they don’t create any.`
      }
      confirmLabel="Backfill past meetings"
      pendingLabel="Starting backfill…"
      pending={pending}
      error={error}
      errorDescription="Couldn’t start the backfill. Try again."
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
