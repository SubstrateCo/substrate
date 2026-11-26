import { crmRecordCapabilities } from "@substrate/contracts/access/capabilities";
import { permissionLabels } from "@substrate/contracts/access/levels";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { CrmActivityLog } from "./crm-activity";
import { DealForm } from "./deal-form";
import { DealTransitionForm } from "./deal-transition";
import { FollowUps } from "./follow-ups";
import { InteractionRollup } from "./interaction-rollup";
import { RecordOwnerProperty, RecordSharing } from "./record-access";
import { RecordConnections } from "./record-connections";
import { RecordDiscussions } from "./record-discussions";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { formatDate, formatMoney, outcomeLabels, outcomeTones } from "@/features/records/format";
import { recordQueries, useCrmWrite, useRecordScope } from "@/features/records/queries";
import { recordLinkActions } from "@/features/records/record-tools";
import type { OnOpenConversation, OnOpenRecord } from "@/features/records/types";
import { DetailHeader } from "@/features/records/ui/layout";
import { Chip, DetailSection, Property, Row } from "@/features/records/ui/rows";
import { ConfirmSheet } from "@/features/records/ui/sheet";
import { ErrorState, LoadingRows, MutationError, Notice } from "@/features/records/ui/states";
import { Archive, Handshake, UserRound } from "lucide-react-native";

export function DealDetailView({
  organizationId,
  dealId,
  onOpenRecord,
  onClose,
  onOpenConversation,
}: {
  organizationId: string;
  dealId: string;
  onOpenRecord: OnOpenRecord;
  onClose?: () => void;
  onOpenConversation?: OnOpenConversation;
}) {
  const scope = useRecordScope(organizationId);
  const query = useQuery(recordQueries.deal(scope, dealId));
  const stages = useQuery(recordQueries.pipeline(scope));
  const write = useCrmWrite(scope);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  if (query.isPending)
    return (
      <View className="flex-1 bg-surface">
        <DetailHeader kind="Deal" title="Loading…" icon={Handshake} onClose={onClose} />
        <LoadingRows label="Loading deal" />
      </View>
    );
  if (query.isError)
    return (
      <View className="flex-1 bg-surface">
        <DetailHeader kind="Deal" title="Deal" icon={Handshake} onClose={onClose} />
        <ErrorState error={query.error} noun="this deal" onRetry={() => void query.refetch()} />
      </View>
    );

  const detail = query.data;
  const { deal } = detail;
  const archived = !!deal.archivedAt;
  const access = crmRecordCapabilities({ level: detail.level, archived });
  const editable = access.canEdit;
  const stage = stages.data?.find((row) => row.id === deal.stageId);
  // The server clears the account ID when the reader cannot open the account.
  const accountId = deal.accountEntityId;

  return (
    <View className="flex-1 bg-surface" testID="deal-detail">
      <DetailHeader
        kind="Deal"
        title={deal.title}
        icon={Handshake}
        onClose={onClose}
        onEdit={editable ? () => setEditing(true) : undefined}
        trailing={<Chip label={outcomeLabels[deal.outcome]} tone={outcomeTones[deal.outcome]} />}
        actions={[
          ...recordLinkActions(organizationId, { kind: "deal", id: dealId }),
          ...(editable && stages.data
            ? [{ label: "Move stage or close", onPress: () => setMoving(true) }]
            : []),
          ...(access.canArchive
            ? [
                archived
                  ? {
                      label: "Restore deal",
                      onPress: () =>
                        write.mutate({ action: "archive", entityId: dealId, archived: false }),
                    }
                  : { label: "Archive deal", destructive: true, onPress: () => setArchiving(true) },
              ]
            : []),
        ]}
      />
      {archived ? (
        <Notice icon={Archive}>This deal is archived. Restore it to make changes.</Notice>
      ) : null}
      {!archived && !editable ? (
        <Notice>{`${permissionLabels[detail.level]}. You can't change this deal.`}</Notice>
      ) : null}
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
      >
        {write.error && !editing && !moving && !archiving ? (
          <View className="px-4 pt-2">
            <MutationError error={write.error} />
          </View>
        ) : null}
        <View className="mt-2 border-t border-border">
          <Property
            label="Stage"
            value={stage?.name ?? (stages.isPending ? "Loading…" : "Unknown stage")}
            onPress={editable && stages.data ? () => setMoving(true) : undefined}
          />
          <Property label="Amount" value={formatMoney(deal.amount, deal.currency)} />
          <Property label="Expected close" value={formatDate(deal.expectedCloseDate)} />
          <RecordOwnerProperty
            scope={scope}
            record={{
              kind: "deal",
              entityId: dealId,
              ownerActorEntityId: deal.ownerActorEntityId,
              version: deal.version,
            }}
            canReassign={access.canReassign}
          />
          {deal.closedAt ? <Property label="Closed" value={formatDate(deal.closedAt)} /> : null}
          {deal.lostReason ? <Property label="Lost reason" value={deal.lostReason} /> : null}
          <Property
            label="Account"
            value={accountId ? detail.account.name : null}
            placeholder="No account you can open"
            onPress={accountId ? () => onOpenRecord({ kind: "account", id: accountId }) : undefined}
          />
        </View>
        <DetailSection title="Summary">
          <Text className="px-4 py-3 text-sm" selectable>
            {deal.summary || "No summary."}
          </Text>
        </DetailSection>
        <DetailSection title="Contacts" count={detail.contacts.length || undefined}>
          {detail.contacts.length ? (
            detail.contacts.map(({ contact, isPrimary }) => (
              <Row
                key={contact.entityId}
                title={contact.displayName}
                subtitle={isPrimary ? "Primary contact" : undefined}
                leading={<Icon as={UserRound} className="size-4 text-muted-foreground" />}
                chevron
                onPress={() => onOpenRecord({ kind: "contact", id: contact.entityId })}
              />
            ))
          ) : (
            <Text className="px-4 py-3 text-sm text-muted-foreground">
              No contacts you can read.
            </Text>
          )}
        </DetailSection>
        <InteractionRollup
          scope={scope}
          entityId={dealId}
          kind="deal"
          onOpenRecord={onOpenRecord}
        />
        <FollowUps
          scope={scope}
          entityId={dealId}
          canCreate={editable}
          onOpenRecord={onOpenRecord}
        />
        <RecordConnections
          scope={scope}
          entityId={dealId}
          editable={editable}
          onOpenRecord={onOpenRecord}
        />
        <RecordDiscussions
          scope={scope}
          entityId={dealId}
          onOpenConversation={onOpenConversation}
        />
        {access.canManageAccess ? (
          <RecordSharing scope={scope} entityId={dealId} noun="deal" />
        ) : null}
        <CrmActivityLog scope={scope} entityId={dealId} />
        <View className="h-10" />
      </ScrollView>

      {editing ? (
        <DealForm
          scope={scope}
          deal={detail}
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            setEditing(false);
          }}
          onSubmit={(draft) =>
            write.mutate(
              { action: "updateDeal", entityId: dealId, expectedVersion: deal.version, ...draft },
              { onSuccess: () => setEditing(false) },
            )
          }
        />
      ) : null}
      {moving && stages.data ? (
        <DealTransitionForm
          stages={stages.data}
          stageId={deal.stageId}
          outcome={deal.outcome}
          lostReason={deal.lostReason}
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            setMoving(false);
          }}
          onSubmit={(value) =>
            write.mutate(
              {
                action: "transitionDeal",
                entityId: dealId,
                expectedVersion: deal.version,
                ...value,
              },
              { onSuccess: () => setMoving(false) },
            )
          }
        />
      ) : null}
      {archiving ? (
        <ConfirmSheet
          title="Archive this deal?"
          description="Archived deals leave the pipeline and become read-only until restored."
          confirmLabel="Archive"
          destructive
          pending={write.isPending}
          error={write.error}
          onCancel={() => setArchiving(false)}
          onConfirm={() =>
            write.mutate(
              { action: "archive", entityId: dealId, archived: true },
              { onSuccess: () => setArchiving(false) },
            )
          }
        />
      ) : null}
    </View>
  );
}
