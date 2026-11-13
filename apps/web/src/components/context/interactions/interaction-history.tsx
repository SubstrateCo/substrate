import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { CrmResourceState } from "@/components/crm/crm-resource-state";
import { formText } from "@/components/crm/form-text";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { NativeField, NativeForm } from "@/components/forms/native-form";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resourceState } from "@/lib/resource-state";
import { useInteractionMutation, interactionsOptions } from "@/queries/context/interactions";
import { Pencil, Trash2 } from "lucide-react";

export function InteractionHistory({
  organizationId,
  contactEntityId,
  canEdit,
  canDelete,
}: {
  organizationId: string;
  contactEntityId: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const query = useQuery(interactionsOptions(organizationId, contactEntityId));
  const mutation = useInteractionMutation(organizationId);
  const [selected, setSelected] = useState<{
    entityId: string;
    summary: string;
    action: "edit" | "delete";
  } | null>(null);
  return (
    <section className="space-y-3" aria-label="Interaction history">
      <h2 className="text-sm font-medium">Interaction history</h2>
      <CrmResourceState
        pending={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
      {!query.error && resourceState(query).data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No interactions recorded</p>
      )}
      <ol className="divide-y">
        {(resourceState(query).data ?? []).map((interaction) => (
          <li key={interaction.entityId} className="group/row space-y-2 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{interactionLabels[interaction.kind]}</span>
              <Timestamp value={interaction.occurredAt} format="datetime" />
              {(canEdit || canDelete) && (
                <RowActions label="Interaction actions" className="ml-auto">
                  {canEdit && (
                    <RowAction
                      label="Edit interaction"
                      onClick={() => {
                        mutation.reset();
                        setSelected({ ...interaction, action: "edit" });
                      }}
                    >
                      <Pencil aria-hidden />
                    </RowAction>
                  )}
                  {canDelete && (
                    <RowAction
                      label="Delete interaction"
                      destructive
                      onClick={() => {
                        mutation.reset();
                        setSelected({ ...interaction, action: "delete" });
                      }}
                    >
                      <Trash2 aria-hidden />
                    </RowAction>
                  )}
                </RowActions>
              )}
            </div>
            <p className="text-sm whitespace-pre-wrap">{interaction.summary}</p>
          </li>
        ))}
      </ol>
      {selected?.action === "edit" && canEdit && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !mutation.isPending) setSelected(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit interaction</DialogTitle>
              <DialogDescription>
                The summary remains visible to this contact’s readers.
              </DialogDescription>
            </DialogHeader>
            <NativeForm
              pending={mutation.isPending}
              onSubmit={(form) =>
                mutation.mutate(
                  {
                    action: "updateInteraction",
                    organizationId,
                    entityId: selected.entityId,
                    summary: formText(form, "summary"),
                  },
                  { onSuccess: () => setSelected(null) },
                )
              }
            >
              <DialogBody>
                <NativeField
                  id="edit-interaction-summary"
                  name="summary"
                  label="Summary"
                  defaultValue={selected.summary}
                  required
                  maxLength={10000}
                />
                <FormMessage
                  error={mutation.error}
                  errorDescription="Couldn’t update this interaction. Try again."
                />
              </DialogBody>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => setSelected(null)}
                >
                  Cancel
                </Button>
                <PendingButton type="submit" pending={mutation.isPending} pendingLabel="Saving…">
                  Save
                </PendingButton>
              </DialogFooter>
            </NativeForm>
          </DialogContent>
        </Dialog>
      )}
      {selected?.action === "delete" && canDelete && (
        <ConfirmDialog
          title="Delete interaction?"
          description="Remove this interaction from normal history. This does not delete its contact or linked source."
          confirmLabel="Delete interaction"
          pendingLabel="Deleting…"
          destructive
          pending={mutation.isPending}
          error={mutation.error}
          errorDescription="Couldn’t delete this interaction. Try again."
          onClose={() => setSelected(null)}
          onConfirm={() =>
            mutation.mutate(
              { action: "deleteInteraction", organizationId, entityId: selected.entityId },
              { onSuccess: () => setSelected(null) },
            )
          }
        />
      )}
    </section>
  );
}

const interactionLabels = {
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  message: "Message",
  note: "Internal note",
  other: "Other",
};
