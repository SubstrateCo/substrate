import { permissionLevels, type PermissionLevel } from "@substrate/contracts/tasks";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import {
  ownerAssignment,
  personName,
  type RecordPerson,
  type ResponsibleRecord,
} from "@/features/records/crm-management";
import { crmQueries, useCrmAccessWrite, useRecordPeople } from "@/features/records/crm-queries";
import { SelectField, SwitchField } from "@/features/records/ui/fields";
import { DetailSection, Property, Row } from "@/features/records/ui/rows";
import { ActionSheet, ConfirmSheet, FormSheet } from "@/features/records/ui/sheet";
import { ErrorState, SectionQuery } from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";

const accessLabels: Record<PermissionLevel, string> = {
  view: "Can view",
  comment: "Can comment",
  edit: "Can edit",
  owner: "Can manage access",
};

function PersonField({
  label,
  people,
  pending,
  error,
  value,
  onChange,
  exclude,
}: {
  label: string;
  people: RecordPerson[];
  pending: boolean;
  error: Error | null;
  value: string | null;
  onChange: (value: string) => void;
  exclude?: string;
}) {
  if (error) return <ErrorState compact error={error} noun="workspace people" />;
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      loading={pending}
      searchable
      placeholder={pending ? "Loading people…" : "Choose a person"}
      description={
        pending || people.length ? undefined : "No eligible workspace people are available."
      }
      choices={people
        .filter((person) => person.id !== exclude)
        .map((person) => ({ value: person.id, label: person.name, description: person.email }))}
    />
  );
}

/** The person responsible for an account or deal. Responsibility does not grant access. */
export function RecordOwnerProperty({
  scope,
  record,
  canReassign,
}: {
  scope: QueryScope;
  record: ResponsibleRecord;
  canReassign: boolean;
}) {
  const directory = useRecordPeople(scope);
  const [open, setOpen] = useState(false);
  let owner = personName(directory.people, record.ownerActorEntityId);
  if (directory.pending) owner = "Loading…";
  if (directory.error) owner = "Unavailable";
  return (
    <>
      <Property
        label="Owner"
        value={owner}
        onPress={canReassign ? () => setOpen(true) : undefined}
      />
      {open ? <OwnerForm scope={scope} record={record} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function OwnerForm({
  scope,
  record,
  onClose,
}: {
  scope: QueryScope;
  record: ResponsibleRecord;
  onClose: () => void;
}) {
  const directory = useRecordPeople(scope);
  const write = useCrmAccessWrite(scope);
  // The record as first seen, so the server rejects the change if someone else moved it first.
  const [expected] = useState(record);
  const [personId, setPersonId] = useState<string | null>(null);
  const [keepRestricted, setKeepRestricted] = useState(false);
  return (
    <FormSheet
      title="Change owner"
      description="Choose who is responsible for this record. Responsibility is not access: it doesn't let them open the record."
      saveLabel="Reassign"
      dirty={!!personId}
      pending={write.isPending}
      canSave={!!personId && personId !== expected.ownerActorEntityId}
      error={write.error}
      onClose={onClose}
      onSave={() => {
        if (!personId) return;
        write.mutate(
          ownerAssignment(
            scope.organizationId,
            expected,
            personId,
            keepRestricted ? "keep_restricted" : "require_existing_access",
          ),
          { onSuccess: onClose },
        );
      }}
    >
      <PersonField
        label="New owner"
        people={directory.people}
        pending={directory.pending}
        error={directory.error}
        value={personId}
        onChange={setPersonId}
        exclude={expected.ownerActorEntityId}
      />
      <SwitchField
        label="Reassign even if they can't open it"
        checked={keepRestricted}
        onChange={setKeepRestricted}
        description={
          keepRestricted
            ? "Warning: they may become responsible for a record they cannot open. No access is granted."
            : "Reassignment fails if this person can't read the record. An access owner can share it first."
        }
      />
    </FormSheet>
  );
}

/** Direct access grants on an account or deal. Only access owners see and change them. */
export function RecordSharing({
  scope,
  entityId,
  noun,
}: {
  scope: QueryScope;
  entityId: string;
  noun: string;
}) {
  const directory = useRecordPeople(scope);
  const grants = useQuery(crmQueries.grants(scope, entityId));
  const write = useCrmAccessWrite(scope);
  const [sharing, setSharing] = useState(false);
  const [selected, setSelected] = useState<{
    actorEntityId: string;
    name: string;
    level: PermissionLevel;
  } | null>(null);
  const [removing, setRemoving] = useState<{ actorEntityId: string; name: string } | null>(null);
  const rows = grants.data ?? [];
  return (
    <DetailSection
      title="Direct access"
      count={rows.length || undefined}
      action={{ label: `Share ${noun}`, onPress: () => setSharing(true) }}
    >
      <Text className="px-4 pt-2 text-xs text-muted-foreground">
        Workspace owners and admins also have access. Linked records and discussions keep their own
        access.
      </Text>
      <SectionQuery
        pending={grants.isPending || directory.pending}
        error={grants.error ?? directory.error}
        noun="direct access"
        onRetry={() => void grants.refetch()}
        emptyText={rows.length ? null : "No one has direct access."}
      >
        {rows.map((grant) => {
          const name = personName(directory.people, grant.actorEntityId);
          return (
            <Row
              key={grant.actorEntityId}
              title={name}
              subtitle={accessLabels[grant.level]}
              onPress={() =>
                setSelected({ actorEntityId: grant.actorEntityId, name, level: grant.level })
              }
            />
          );
        })}
      </SectionQuery>
      {selected ? (
        <ActionSheet
          title={selected.name}
          onClose={() => setSelected(null)}
          actions={[
            ...permissionLevels
              .filter((level) => level !== selected.level)
              .map((level) => ({
                label: `Change to ${accessLabels[level].toLowerCase()}`,
                onPress: () =>
                  write.mutate({
                    action: "share",
                    organizationId: scope.organizationId,
                    entityId,
                    actorEntityId: selected.actorEntityId,
                    level,
                  }),
              })),
            {
              label: "Remove direct access",
              destructive: true,
              onPress: () => setRemoving(selected),
            },
          ]}
        />
      ) : null}
      {sharing ? (
        <ShareForm
          scope={scope}
          entityId={entityId}
          noun={noun}
          people={directory.people}
          pending={directory.pending}
          error={directory.error}
          currentLevel={(actorEntityId) =>
            rows.find((grant) => grant.actorEntityId === actorEntityId)?.level
          }
          onClose={() => setSharing(false)}
        />
      ) : null}
      {removing ? (
        <ConfirmSheet
          title={`Remove ${removing.name}'s direct access?`}
          description="Workspace owners and admins may still have access. This doesn't change who is responsible or access to linked records."
          confirmLabel="Remove access"
          destructive
          pending={write.isPending}
          error={write.error}
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            write.mutate(
              {
                action: "revoke",
                organizationId: scope.organizationId,
                entityId,
                actorEntityId: removing.actorEntityId,
              },
              { onSuccess: () => setRemoving(null) },
            )
          }
        />
      ) : null}
      {write.error && !sharing && !removing ? (
        <View className="px-4 py-2">
          <ErrorState compact error={write.error} noun="access" />
        </View>
      ) : null}
    </DetailSection>
  );
}

function ShareForm({
  scope,
  entityId,
  noun,
  people,
  pending,
  error,
  currentLevel,
  onClose,
}: {
  scope: QueryScope;
  entityId: string;
  noun: string;
  people: RecordPerson[];
  pending: boolean;
  error: Error | null;
  currentLevel: (actorEntityId: string) => PermissionLevel | undefined;
  onClose: () => void;
}) {
  const write = useCrmAccessWrite(scope);
  const [personId, setPersonId] = useState<string | null>(null);
  const [level, setLevel] = useState<PermissionLevel>("view");
  return (
    <FormSheet
      title={`Share ${noun}`}
      description="Sets this person's direct access. Their agent can act with their access."
      saveLabel="Share"
      dirty={!!personId}
      pending={write.isPending}
      canSave={!!personId}
      error={write.error}
      onClose={onClose}
      onSave={() => {
        if (!personId) return;
        write.mutate(
          {
            action: "share",
            organizationId: scope.organizationId,
            entityId,
            actorEntityId: personId,
            level,
          },
          { onSuccess: onClose },
        );
      }}
    >
      <PersonField
        label="Person"
        people={people}
        pending={pending}
        error={error}
        value={personId}
        onChange={(value) => {
          setPersonId(value);
          setLevel(currentLevel(value) ?? "view");
        }}
      />
      <SelectField
        label="Access"
        value={level}
        onChange={setLevel}
        choices={permissionLevels.map((value) => ({ value, label: accessLabels[value] }))}
        description={
          level === "owner"
            ? "They can edit this record and manage access. This doesn't make them responsible for it."
            : undefined
        }
      />
    </FormSheet>
  );
}
