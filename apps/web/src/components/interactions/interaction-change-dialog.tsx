import { formText } from "@/components/crm/form-text";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormDialog } from "@/components/feedback/form-dialog";
import { NativeField } from "@/components/forms/native-form";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useInteractionMutation } from "@/queries/context/interactions";

export type InteractionChange = {
  entityId: string;
  summary: string;
  action: "edit" | "delete";
};

/** Edit an interaction's summary, or confirm its deletion. */
export function InteractionChangeDialog({
  change,
  onClose,
  onDone = onClose,
}: {
  change: InteractionChange;
  onClose: () => void;
  /** Runs after a successful save or delete. Defaults to `onClose`. */
  onDone?: () => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const mutation = useInteractionMutation(organizationId);
  if (change.action === "edit")
    return (
      <FormDialog
        title="Edit interaction"
        description="The summary remains visible to everyone in the workspace."
        saveLabel="Save"
        nativeValidation
        pending={mutation.isPending}
        error={mutation.error}
        errorDescription="Couldn’t update this interaction. Try again."
        onClose={onClose}
        onSubmit={(form) =>
          mutation.mutate(
            {
              action: "updateInteraction",
              organizationId,
              entityId: change.entityId,
              summary: formText(form, "summary"),
            },
            { onSuccess: onDone },
          )
        }
      >
        <NativeField
          id="edit-interaction-summary"
          name="summary"
          label="Summary"
          multiline
          defaultValue={change.summary}
          required
          missingMessage="Enter a summary."
          maxLength={10000}
        />
      </FormDialog>
    );
  return (
    <ConfirmDialog
      title="Delete interaction?"
      description="Remove this interaction from normal history. This does not delete its contact or linked source."
      confirmLabel="Delete interaction"
      destructive
      pending={mutation.isPending}
      error={mutation.error}
      errorDescription="Couldn’t delete this interaction. Try again."
      onClose={onClose}
      onConfirm={() =>
        mutation.mutate(
          { action: "deleteInteraction", organizationId, entityId: change.entityId },
          { onSuccess: onDone },
        )
      }
    />
  );
}
