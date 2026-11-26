import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import { View } from "react-native";

import { crmQueries } from "@/features/records/crm-queries";
import { refreshRecords } from "@/features/records/invalidation";
import { recordRequests } from "@/features/records/requests";
import { targetForEntity, type OnOpenRecord } from "@/features/records/types";
import { SelectField, TextField } from "@/features/records/ui/fields";
import { useDebounced } from "@/features/records/ui/layout";
import { DetailSection, Row } from "@/features/records/ui/rows";
import { ActionSheet, ConfirmSheet, FormSheet } from "@/features/records/ui/sheet";
import { SectionQuery, MutationError } from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";

type LinkedRecord = Awaited<ReturnType<typeof recordRequests.recordLinks>>[number];

export function RecordConnections({
  scope,
  entityId,
  editable = false,
  onOpenRecord,
}: {
  scope: QueryScope;
  entityId: string;
  editable?: boolean;
  onOpenRecord: OnOpenRecord;
}) {
  const query = useQuery(crmQueries.recordLinks(scope, entityId));
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<LinkedRecord | null>(null);
  const [removing, setRemoving] = useState<LinkedRecord | null>(null);
  const write = useMutation({
    mutationFn: (otherEntityId: string) =>
      recordRequests.removeRecordLink({
        organizationId: scope.organizationId,
        entityId,
        otherEntityId,
      }),
    onSuccess: () => {
      setRemoving(null);
      return refreshRecords(client, scope);
    },
  });
  const rows = query.data ?? [];
  const open = (row: LinkedRecord) => {
    const target = targetForEntity(row.entityType, row.entityId, row.projectEntityId);
    if (target) onOpenRecord(target);
  };
  return (
    <View testID="record-connections">
      <DetailSection
        title="Linked records"
        count={rows.length || undefined}
        action={editable ? { label: "Link record", onPress: () => setAdding(true) } : undefined}
      >
        <SectionQuery
          pending={query.isPending}
          error={query.error}
          noun="linked records"
          onRetry={() => void query.refetch()}
          emptyText={rows.length ? null : "No linked records you can read."}
        >
          {rows.map((row) => (
            <Row
              key={row.id}
              title={row.title}
              subtitle={row.entityType.replaceAll("_", " ")}
              chevron
              onPress={() => (editable ? setSelected(row) : open(row))}
            />
          ))}
        </SectionQuery>
        {selected ? (
          <ActionSheet
            title={selected.title}
            onClose={() => setSelected(null)}
            actions={[
              { label: "Open linked record", onPress: () => open(selected) },
              {
                label: "Remove record link",
                destructive: true,
                onPress: () => {
                  write.reset();
                  setRemoving(selected);
                },
              },
            ]}
          />
        ) : null}
        {removing ? (
          <ConfirmSheet
            title="Remove this record link?"
            description="Neither record is deleted. Access and structural relationships stay unchanged."
            confirmLabel="Remove link"
            destructive
            pending={write.isPending}
            error={write.error}
            onCancel={() => setRemoving(null)}
            onConfirm={() => write.mutate(removing.entityId)}
          />
        ) : null}
        {adding ? (
          <LinkForm
            scope={scope}
            entityId={entityId}
            existing={rows.map((row) => row.entityId)}
            onClose={() => setAdding(false)}
          />
        ) : null}
      </DetailSection>
    </View>
  );
}

function LinkForm({
  scope,
  entityId,
  existing,
  onClose,
}: {
  scope: QueryScope;
  entityId: string;
  existing: string[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const term = useDebounced(search);
  const query = useQuery(crmQueries.linkTargets(scope, term));
  const client = useQueryClient();
  const write = useMutation({
    mutationFn: (otherEntityId: string) =>
      recordRequests.addRecordLink({
        organizationId: scope.organizationId,
        entityId,
        otherEntityId,
      }),
    onSuccess: async () => {
      await refreshRecords(client, scope);
      onClose();
    },
  });
  return (
    <FormSheet
      title="Link record"
      description="Adds context, not membership or access. Each record keeps its own permissions."
      saveLabel="Link"
      dirty={!!target}
      canSave={!!target}
      pending={write.isPending}
      error={write.error}
      onClose={onClose}
      onSave={() => {
        if (target) write.mutate(target);
      }}
    >
      <TextField label="Search records" value={search} onChange={setSearch} maxLength={200} />
      <MutationError error={query.error} />
      <SelectField
        label="Record"
        value={target}
        onChange={setTarget}
        loading={query.isPending}
        searchable
        choices={(query.data ?? [])
          .filter((row) => row.id !== entityId && !existing.includes(row.id))
          .map((row) => ({
            value: row.id,
            label: row.title,
            description: row.kind.replaceAll("_", " "),
          }))}
        description="Search by name to find more records."
      />
    </FormSheet>
  );
}
