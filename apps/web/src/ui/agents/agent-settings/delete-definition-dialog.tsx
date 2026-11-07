import { useState } from "react";

import { Button } from "@/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/primitives/dialog";

export function DeleteDefinitionDialog({
  name,
  pending,
  onClose,
  onDelete,
}: {
  name: string;
  pending: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [error, setError] = useState<string>();
  async function remove() {
    setError(undefined);
    try {
      await onDelete();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete definition.");
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
          <DialogTitle className="wrap-anywhere">Delete {name}?</DialogTitle>
          <DialogDescription>
            This deletes the selected definition. Native conversation history is not deleted. This
            cannot be undone.
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
          <Button variant="destructive" disabled={pending} onClick={() => void remove()}>
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
