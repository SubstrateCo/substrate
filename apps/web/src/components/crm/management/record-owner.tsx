import type { CrmWrite } from "@substrate/contracts/crm/input";
import type { PermissionLevel } from "@substrate/contracts/tasks";

import { useId, useState } from "react";

import { RecordPersonField } from "./record-people";
import { useRecordPeople } from "./record-people-directory";
import { FormDialog } from "@/components/feedback/form-dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useCrmMutation } from "@/queries/crm/mutations";

type Assignment = Extract<CrmWrite, { action: "assignOwner" }>;

export type RecordOwnerProps = {
  entityId: string;
  name: string;
  level: PermissionLevel;
  record:
    | { kind: "account"; ownerActorEntityId: string }
    | { kind: "deal"; ownerActorEntityId: string; version: number };
  onClose: () => void;
  onRestoreFocus?: () => void;
};

export function RecordOwner({
  entityId,
  name,
  level,
  record,
  onClose,
  onRestoreFocus,
}: RecordOwnerProps) {
  const { organizationId } = useWorkspaceScope();
  const id = useId();
  const mutation = useCrmMutation(organizationId);
  const directory = useRecordPeople();
  const [expectedRecord] = useState(record);
  const [personId, setPersonId] = useState("");
  const [decision, setDecision] = useState<Assignment["accessDecision"]>("require_existing_access");
  const actor = directory.people.find((candidate) => candidate.id === personId);
  const canEdit = level === "edit" || level === "owner";
  const canSubmit = canEdit && !!actor && actor.id !== expectedRecord.ownerActorEntityId;
  if (!canEdit) return null;
  return (
    <FormDialog
      title={`Reassign ${name}`}
      description="Choose the person responsible for this record. Responsibility is not security ownership and does not grant access."
      saveLabel="Reassign responsibility"
      pending={mutation.isPending}
      disabled={!canSubmit}
      error={mutation.error}
      errorDescription="Couldn’t reassign responsibility. The record may have changed, or this person may not have access. Reload and try again, share the record separately, or explicitly keep access restricted."
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      onSubmit={() => {
        if (!canSubmit) return;
        const input: Assignment = {
          action: "assignOwner",
          organizationId,
          entityId,
          ownerActorEntityId: actor.id,
          expectedOwnerActorEntityId: expectedRecord.ownerActorEntityId,
          accessDecision: decision,
        };
        if (expectedRecord.kind === "deal") input.expectedVersion = expectedRecord.version;
        mutation.mutate(input, { onSuccess: onClose });
      }}
    >
      <RecordPersonField
        directory={directory}
        value={personId}
        onValueChange={(value) => {
          mutation.reset();
          setPersonId(value);
        }}
        disabled={mutation.isPending}
      />
      <Field>
        <FieldLabel id={`${id}-access`}>If this person cannot read the record</FieldLabel>
        <RadioGroup
          aria-labelledby={`${id}-access`}
          value={decision}
          onValueChange={(value) => {
            if (value === "require_existing_access" || value === "keep_restricted") {
              mutation.reset();
              setDecision(value);
            }
          }}
        >
          <Field orientation="horizontal">
            <RadioGroupItem id={`${id}-require`} value="require_existing_access" />
            <FieldLabel htmlFor={`${id}-require`}>
              Do not reassign without existing access
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <RadioGroupItem id={`${id}-restricted`} value="keep_restricted" />
            <FieldLabel htmlFor={`${id}-restricted`}>
              Reassign and keep access restricted
            </FieldLabel>
          </Field>
        </RadioGroup>
        <FieldDescription>
          {decision === "keep_restricted"
            ? "Warning: this person may be responsible for a record they cannot open. No access will be granted."
            : "Reassignment will fail if this person cannot read the record. An access owner can share it separately first."}
        </FieldDescription>
      </Field>
    </FormDialog>
  );
}
