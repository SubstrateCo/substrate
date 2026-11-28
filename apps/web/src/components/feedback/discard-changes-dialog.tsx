import type { ReactNode } from "react";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

export function DiscardChangesDialog(props: {
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
      cancelLabel="Keep editing"
      destructive
      {...props}
    />
  );
}
