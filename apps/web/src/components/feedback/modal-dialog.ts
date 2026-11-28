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
