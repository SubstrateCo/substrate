import type { ProjectPermission } from "../../types";
import { FormMessage } from "@/components/auth/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type ProjectAccessChange = {
  actorEntityId: string;
  name: string;
  level: ProjectPermission | null;
};

export function ProjectAccessReview({
  change,
  projectName,
  pending,
  error,
  onCancel,
  onConfirm,
  onRestoreFocus,
}: {
  change: ProjectAccessChange;
  projectName: string;
  pending: boolean;
  error?: Error | null;
  onCancel: () => void;
  onConfirm: () => void;
  onRestoreFocus: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (pending) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <DialogTitle>Review access change</DialogTitle>
        <DialogDescription className="min-w-0 wrap-anywhere">
          {change.level
            ? `Give ${change.name} ${change.level} access to ${projectName}?`
            : `Remove ${change.name}’s direct access to ${projectName}?`}
        </DialogDescription>
        <p className="text-sm">
          This applies to every task, subtask, and comment in this project. Linked messages keep
          their separate permissions.
        </p>
        {change.level === "owner" && (
          <p className="text-sm text-muted-foreground">Owners can manage project access.</p>
        )}
        <FormMessage error={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            Cancel access change
          </Button>
          <PendingButton pending={pending} pendingLabel="Updating access…" onClick={onConfirm}>
            {change.level ? "Confirm access" : "Remove access"}
          </PendingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
