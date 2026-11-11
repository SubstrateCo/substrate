import type { ReactNode } from "react";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

/** Asks before unsaved changes are lost. Cancel reads "Keep editing". */
export function DiscardChangesDialog(props: {
  /** What would be lost, such as "Your new name isn't saved." */
  description: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
  onRestoreFocus?: () => void;
  children?: ReactNode;
}) {
  return (
    <ConfirmDialog
      title="Discard unsaved changes?"
      confirmLabel="Discard changes"
      pendingLabel="Discarding…"
      cancelLabel="Keep editing"
      destructive
      {...props}
    />
  );
}
