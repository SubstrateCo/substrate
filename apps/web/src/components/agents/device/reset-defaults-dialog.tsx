import { useState } from "react";

import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ResetDefaultsDialog({
  pending,
  onClose,
  onReset,
}: {
  pending: boolean;
  onClose: () => void;
  onReset: () => Promise<void>;
}) {
  const [error, setError] = useState<string>();
  async function reset() {
    setError(undefined);
    try {
      await onReset();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reset defaults.");
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Startup OS defaults?</DialogTitle>
          <DialogDescription>
            This replaces the agent's instructions file and Startup OS skills on this device with
            the saved agent settings. Local edits to those files are lost. Your other skills and MCP
            servers are not changed.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <PendingButton
            variant="destructive"
            pending={pending}
            pendingLabel="Resetting"
            onClick={() => void reset()}
          >
            Reset
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
