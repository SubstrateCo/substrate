import { useBlocker } from "@tanstack/react-router";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

/**
 * Asks before the person leaves a settings page with an unsaved draft. A clean page never asks.
 * `description` names what would be lost, such as "Your new name isn’t saved."
 */
export function UnsavedChangesGuard({
  dirty,
  description,
}: {
  dirty: boolean;
  description: string;
}) {
  const blocker = useBlocker({
    shouldBlockFn: () => true,
    disabled: !dirty,
    // Not on unload: Electron would cancel closing the window without asking.
    enableBeforeUnload: false,
    withResolver: true,
  });
  if (blocker.status !== "blocked") return null;
  return (
    <ConfirmDialog
      title="Discard unsaved changes?"
      description={description}
      confirmLabel="Discard changes"
      pendingLabel="Discarding…"
      cancelLabel="Keep editing"
      destructive
      onConfirm={blocker.proceed}
      onClose={blocker.reset}
    />
  );
}
