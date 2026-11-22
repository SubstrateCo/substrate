/**
 * Props for a dialog that is open while mounted. Closing asks the parent to unmount it, except
 * while an action is pending. With onRestoreFocus, closing focuses that element instead of the
 * opener.
 */
export function modalDialogProps({
  pending = false,
  onClose,
  onRestoreFocus,
}: {
  pending?: boolean;
  onClose: () => void;
  onRestoreFocus?: () => void;
}) {
  return {
    root: {
      open: true,
      onOpenChange: (open: boolean) => {
        if (!open && !pending) onClose();
      },
    },
    content: {
      onCloseAutoFocus: (event: Event) => {
        if (!onRestoreFocus) return;
        event.preventDefault();
        onRestoreFocus();
      },
    },
  };
}
