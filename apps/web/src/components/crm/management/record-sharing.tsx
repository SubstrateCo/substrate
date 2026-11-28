import { crmAccessLabels } from "@substrate/contracts/access/levels";
import { permissionLevels, type PermissionLevel } from "@substrate/contracts/tasks";

import { useQuery } from "@tanstack/react-query";

import { useState, type ReactNode } from "react";

import { RecordGrants } from "./record-grants";
import { RecordPersonField } from "./record-people";
import { useRecordPeople } from "./record-people-directory";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormDialog } from "@/components/feedback/form-dialog";
import { FormMessage } from "@/components/feedback/form-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { SelectField } from "@/components/forms/select-field";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { resourceState, type ResourceState } from "@/lib/resource-state";
import { crmGrantsOptions } from "@/queries/crm/management";
import { useCrmMutation } from "@/queries/crm/mutations";

const permissions = permissionLevels.map((value) => ({ value, label: crmAccessLabels[value] }));

export function RecordSharing({
  entityId,
  name,
  noun,
  onClose,
  onRestoreFocus,
}: {
  entityId: string;
  name: string;
  noun: string;
  onClose: () => void;
  onRestoreFocus?: () => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const mutation = useCrmMutation(organizationId);
  const directory = useRecordPeople();
  const grants = useQuery(crmGrantsOptions(organizationId, entityId));
  const [personId, setPersonId] = useState("");
  const [permission, setPermission] = useState<PermissionLevel>("view");
  const [removing, setRemoving] = useState<{ actorEntityId: string; name: string } | null>(null);
  const actor = directory.people.find((candidate) => candidate.id === personId);
  const ready = !directory.pending && !directory.error && !grants.isPending && !grants.error;
  const canSubmit = ready && !!actor;
  return (
    <>
      <FormDialog
        title={`Share ${name}`}
        description="Manage direct access to this record. Organization owners and admins also have access. Linked customer records and discussions keep their own access."
        saveLabel={`Share ${noun}`}
        pending={mutation.isPending}
        disabled={!canSubmit}
        error={removing ? null : mutation.error}
        errorDescription="Couldn’t change access. Keep at least one owner, or reload the record and try again."
        onClose={onClose}
        onRestoreFocus={onRestoreFocus}
        onSubmit={() => {
          if (!canSubmit) return;
          mutation.mutate(
            {
              action: "share",
              organizationId,
              entityId,
              actorEntityId: actor.id,
              level: permission,
            },
            { onSuccess: onClose },
          );
        }}
      >
        <FieldSet className="min-w-0">
          <FieldLegend variant="label">Direct access</FieldLegend>
          <DirectAccessBody
            state={resourceState(grants)}
            directoryReady={!directory.pending && !directory.error}
          >
            {(rows) => (
              <RecordGrants
                grants={rows}
                people={directory.people}
                disabled={mutation.isPending}
                onRemove={(person) => {
                  mutation.reset();
                  setRemoving(person);
                }}
              />
            )}
          </DirectAccessBody>
        </FieldSet>
        <RecordPersonField
          directory={directory}
          value={personId}
          onValueChange={(value) => {
            mutation.reset();
            setPersonId(value);
            const existing = grants.data?.find((grant) => grant.actorEntityId === value);
            setPermission(existing?.level ?? "view");
          }}
          disabled={mutation.isPending}
        />
        <SelectField
          label="Access"
          value={permission}
          onChange={(value) => {
            mutation.reset();
            setPermission(value);
          }}
          options={permissions}
          description={
            permission === "owner"
              ? "This person can edit this record and manage access. This does not make them responsible for it."
              : "Confirming sets this person’s direct access to the selected level. Their agent can act with their access."
          }
        />
      </FormDialog>
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}’s direct access?`}
          description={`Remove their direct grant to “${name}”. Organization owners and admins may still have access. This does not change responsibility or access to linked records.`}
          destructive
          confirmLabel="Remove access"
          pending={mutation.isPending}
          error={mutation.error}
          errorDescription="Couldn’t remove access. Keep at least one owner, or reload the record and try again."
          onClose={() => {
            mutation.reset();
            setRemoving(null);
          }}
          onConfirm={() =>
            mutation.mutate(
              { action: "revoke", organizationId, entityId, actorEntityId: removing.actorEntityId },
              { onSuccess: onClose },
            )
          }
        />
      )}
    </>
  );
}

function DirectAccessBody<T>({
  state,
  directoryReady,
  children,
}: {
  state: ResourceState<T>;
  directoryReady: boolean;
  children: (grants: T) => ReactNode;
}) {
  if (state.status === "loading")
    return <LoadingState label="Loading direct access" variant="compact" rows={2} />;
  if (state.data === undefined)
    return (
      <FormMessage
        error={state.error}
        errorDescription="Couldn’t load direct access. Close this dialog and try again."
      />
    );
  return (
    <>
      {state.status === "stale" && (
        <StaleNotice
          title="Couldn’t load direct access"
          description="Close this dialog and try again."
        />
      )}
      {directoryReady && children(state.data)}
    </>
  );
}
