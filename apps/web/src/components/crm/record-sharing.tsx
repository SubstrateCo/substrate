import type { CrmWrite } from "@substrate/contracts/crm/input";

import { useQuery } from "@tanstack/react-query";

import { useId, useState } from "react";

import { RecordGrants } from "./record-grants";
import { RecordPersonField } from "./record-people";
import { useRecordPeople } from "./record-people-directory";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormDialog } from "@/components/feedback/form-dialog";
import { FormMessage } from "@/components/feedback/form-message";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PickedRecipient } from "@/lib/people/people-picker";
import { crmGrantsOptions } from "@/queries/crm/management";
import { useCrmMutation } from "@/queries/crm/mutations";

type Level = Extract<CrmWrite, { action: "share" }>["level"];
const permissions: Level[] = ["view", "comment", "edit", "owner"];

export type RecordSharingProps = {
  organizationId: string;
  entityId: string;
  name: string;
  level: Level;
  onClose: () => void;
  onRestoreFocus?: () => void;
};

export function RecordSharing({
  organizationId,
  entityId,
  name,
  level,
  onClose,
  onRestoreFocus,
}: RecordSharingProps) {
  const id = useId();
  const mutation = useCrmMutation(organizationId);
  const directory = useRecordPeople(organizationId);
  const grants = useQuery({
    ...crmGrantsOptions(organizationId, entityId),
    enabled: level === "owner",
  });
  const [people, setPeople] = useState<PickedRecipient[]>([]);
  const [pendingText, setPendingText] = useState("");
  const [permission, setPermission] = useState<Level>("view");
  const [removing, setRemoving] = useState<{ actorEntityId: string; name: string } | null>(null);
  const actor = directory.people.find((candidate) => candidate.id === people[0]?.person?.id);
  const ready = !directory.pending && !directory.error && !grants.isPending && !grants.error;
  const canSubmit = ready && !!actor && !pendingText.trim();
  if (level !== "owner") return null;
  return (
    <>
      <FormDialog
        title={`Share ${name}`}
        description="Manage direct access to this record. Organization owners and admins also have access. Linked customer records and discussions keep their own access."
        size="default"
        saveLabel="Set access"
        pendingLabel="Sharing…"
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
        <div className="space-y-2">
          <p className="text-sm font-medium">Direct access</p>
          {grants.isPending && <FieldDescription>Loading direct access…</FieldDescription>}
          <FormMessage
            error={grants.error}
            errorDescription="Couldn’t load direct access. Close this dialog and try again."
          />
          {ready && (
            <RecordGrants
              grants={grants.data}
              people={directory.people}
              disabled={mutation.isPending}
              onRemove={(person) => {
                mutation.reset();
                setRemoving(person);
              }}
            />
          )}
        </div>
        <RecordPersonField
          id={`${id}-person`}
          directory={directory}
          value={people}
          onValueChange={(value) => {
            mutation.reset();
            setPeople(value);
            const existing = grants.data?.find(
              (grant) => grant.actorEntityId === value[0]?.person?.id,
            );
            setPermission(existing?.level ?? "view");
          }}
          onPendingTextChange={setPendingText}
          disabled={mutation.isPending}
        />
        <Field>
          <FieldLabel htmlFor={`${id}-permission`}>Access</FieldLabel>
          <Select
            value={permission}
            onValueChange={(value) => {
              const selected = permissions.find((permission) => permission === value);
              if (selected) {
                mutation.reset();
                setPermission(selected);
              }
            }}
          >
            <SelectTrigger id={`${id}-permission`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="view">Can view</SelectItem>
              <SelectItem value="comment">Can comment</SelectItem>
              <SelectItem value="edit">Can edit</SelectItem>
              <SelectItem value="owner">Can manage access</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>
            {permission === "owner"
              ? "This person can edit this record and manage access. This does not make them responsible for it."
              : "Confirming sets this person’s direct access to the selected level. Their agent can act with their access."}
          </FieldDescription>
        </Field>
      </FormDialog>
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}’s direct access?`}
          description={`Remove their direct grant to “${name}”. Organization owners and admins may still have access. This does not change responsibility or access to linked records.`}
          destructive
          confirmLabel="Remove access"
          pendingLabel="Removing…"
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
