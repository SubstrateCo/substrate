import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function EditorDialog({
  title,
  saveLabel,
  description,
  children,
  pending,
  onClose,
  onSave,
}: {
  title: string;
  saveLabel: string;
  description: string;
  children: ReactNode;
  pending: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [error, setError] = useState<string>();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(undefined);
            void Promise.resolve()
              .then(onSave)
              .catch((cause: unknown) =>
                setError(cause instanceof Error ? cause.message : "Could not save changes."),
              );
          }}
        >
          <fieldset disabled={pending} className="grid min-w-0 gap-4">
            {children}
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : saveLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
