import { useQuery } from "@tanstack/react-query";

import { useState } from "react";
import { Linking, RefreshControl, ScrollView, View } from "react-native";

import { AccountForm } from "./account-form";
import { AffiliationForm } from "./affiliation-form";
import { CrmActivityLog } from "./crm-activity";
import { DealForm } from "./deal-form";
import { FollowUps } from "./follow-ups";
import { InteractionRollup } from "./interaction-rollup";
import { RecordOwnerProperty, RecordSharing } from "./record-access";
import { RecordConnections } from "./record-connections";
import { RecordDiscussions } from "./record-discussions";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  canEdit,
  formatMoney,
  newRequestId,
  outcomeLabels,
  outcomeTones,
} from "@/features/records/format";
import {
  recordQueries,
  useCreateDeal,
  useCrmWrite,
  useRecordScope,
} from "@/features/records/queries";
import { recordLinkActions } from "@/features/records/record-tools";
import type { OnOpenConversation, OnOpenRecord } from "@/features/records/types";
import { DetailHeader } from "@/features/records/ui/layout";
import { Chip, DetailSection, Property, Row } from "@/features/records/ui/rows";
import { ActionSheet, ConfirmSheet } from "@/features/records/ui/sheet";
import { ErrorState, LoadingRows, MutationError, Notice } from "@/features/records/ui/states";
import { Archive, Building2, Handshake, UserRound } from "lucide-react-native";

export function AccountDetailView({
  organizationId,
  accountId,
  onOpenRecord,
  onClose,
  onOpenConversation,
}: {
  organizationId: string;
  accountId: string;
  onOpenRecord: OnOpenRecord;
  onClose?: () => void;
  onOpenConversation?: OnOpenConversation;
}) {
  const scope = useRecordScope(organizationId);
  const query = useQuery(recordQueries.account(scope, accountId));
  const write = useCrmWrite(scope);
  const [editing, setEditing] = useState(false);
  const [creatingDeal, setCreatingDeal] = useState(false);
  const [affiliating, setAffiliating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [personMenu, setPersonMenu] = useState<{
    contactEntityId: string;
    name: string;
    title: string;
    isPrimary: boolean;
  } | null>(null);
  const [editingAffiliation, setEditingAffiliation] = useState<{
    otherEntityId: string;
    name: string;
    title: string;
    isPrimary: boolean;
  } | null>(null);

  if (query.isPending)
    return (
      <View className="flex-1 bg-surface">
        <DetailHeader kind="Account" title="Loading…" icon={Building2} onClose={onClose} />
        <LoadingRows label="Loading account" />
      </View>
    );
  if (query.isError)
    return (
      <View className="flex-1 bg-surface">
        <DetailHeader kind="Account" title="Account" icon={Building2} onClose={onClose} />
        <ErrorState error={query.error} noun="this account" onRetry={() => void query.refetch()} />
      </View>
    );

  const detail = query.data;
  const { account } = detail;
  const archived = !!account.archivedAt;
  const editable = canEdit(detail.level) && !archived;

  return (
    <View className="flex-1 bg-surface" testID="account-detail">
      <DetailHeader
        kind="Account"
        title={account.name}
        icon={Building2}
        onClose={onClose}
        onEdit={editable ? () => setEditing(true) : undefined}
        actions={[
          ...recordLinkActions(organizationId, { kind: "account", id: accountId }),
          ...(editable ? [{ label: "New deal", onPress: () => setCreatingDeal(true) }] : []),
          ...(canEdit(detail.level)
            ? [
                archived
                  ? {
                      label: "Restore account",
                      onPress: () =>
                        write.mutate({ action: "archive", entityId: accountId, archived: false }),
                    }
                  : {
                      label: "Archive account",
                      destructive: true,
                      onPress: () => setArchiving(true),
                    },
              ]
            : []),
        ]}
      />
      {archived ? (
        <Notice icon={Archive}>This account is archived. Restore it to make changes.</Notice>
      ) : null}
      {!archived && !editable ? (
        <Notice>You can view this account but not change it.</Notice>
      ) : null}
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
      >
        {write.error && !editing && !archiving && !creatingDeal ? (
          <View className="px-4 pt-2">
            <MutationError error={write.error} />
          </View>
        ) : null}
        <View className="mt-2 border-t border-border">
          <Property
            label="Website"
            value={account.website}
            onPress={
              account.website
                ? () => void Linking.openURL(account.website!).catch(() => undefined)
                : undefined
            }
          />
          <Property label="Domain" value={account.domain} />
          <RecordOwnerProperty
            scope={scope}
            record={{
              kind: "account",
              entityId: accountId,
              ownerActorEntityId: account.ownerActorEntityId,
            }}
            canReassign={editable}
          />
        </View>
        <DetailSection title="Summary">
          <Text className="px-4 py-3 text-sm" selectable>
            {account.summary || "No summary."}
          </Text>
        </DetailSection>
        <DetailSection
          title="People"
          count={detail.contacts.length || undefined}
          action={
            editable ? { label: "Add person", onPress: () => setAffiliating(true) } : undefined
          }
        >
          {detail.contacts.length ? (
            detail.contacts.map(({ contact, affiliation }) => (
              <Row
                key={contact.entityId}
                title={contact.displayName}
                subtitle={
                  [affiliation.title, affiliation.isPrimary ? "Primary account" : null]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
                leading={<Icon as={UserRound} className="size-4 text-muted-foreground" />}
                onPress={() =>
                  setPersonMenu({
                    contactEntityId: contact.entityId,
                    name: contact.displayName,
                    title: affiliation.title,
                    isPrimary: affiliation.isPrimary,
                  })
                }
              />
            ))
          ) : (
            <Text className="px-4 py-3 text-sm text-muted-foreground">No people you can read.</Text>
          )}
        </DetailSection>
        <DetailSection
          title="Deals"
          count={detail.deals.length || undefined}
          action={
            editable ? { label: "New deal", onPress: () => setCreatingDeal(true) } : undefined
          }
        >
          {detail.deals.length ? (
            detail.deals.map((deal) => (
              <Row
                key={deal.entityId}
                title={deal.title}
                subtitle={formatMoney(deal.amount, deal.currency) || undefined}
                leading={<Icon as={Handshake} className="size-4 text-muted-foreground" />}
                trailing={
                  <Chip label={outcomeLabels[deal.outcome]} tone={outcomeTones[deal.outcome]} />
                }
                onPress={() => onOpenRecord({ kind: "deal", id: deal.entityId })}
              />
            ))
          ) : (
            <Text className="px-4 py-3 text-sm text-muted-foreground">No deals you can read.</Text>
          )}
        </DetailSection>
        <InteractionRollup
          scope={scope}
          entityId={accountId}
          kind="account"
          onOpenRecord={onOpenRecord}
        />
        <FollowUps
          scope={scope}
          entityId={accountId}
          canCreate={editable}
          onOpenRecord={onOpenRecord}
        />
        <RecordConnections
          scope={scope}
          entityId={accountId}
          editable={editable}
          onOpenRecord={onOpenRecord}
        />
        <RecordDiscussions
          scope={scope}
          entityId={accountId}
          onOpenConversation={onOpenConversation}
        />
        {detail.level === "owner" && !archived ? (
          <RecordSharing scope={scope} entityId={accountId} noun="account" />
        ) : null}
        <CrmActivityLog scope={scope} entityId={accountId} />
        <View className="h-10" />
      </ScrollView>

      {editing ? (
        <AccountForm
          account={account}
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            setEditing(false);
          }}
          onSubmit={(draft) =>
            write.mutate(
              { action: "updateAccount", entityId: accountId, ...draft },
              { onSuccess: () => setEditing(false) },
            )
          }
        />
      ) : null}
      {creatingDeal ? (
        <NewDeal
          organizationId={organizationId}
          account={{ entityId: accountId, name: account.name }}
          onOpenRecord={onOpenRecord}
          onClose={() => setCreatingDeal(false)}
        />
      ) : null}
      {affiliating ? (
        <AffiliationForm
          scope={scope}
          mode={{ fixed: "account", accountEntityId: accountId }}
          onClose={() => setAffiliating(false)}
        />
      ) : null}
      {personMenu ? (
        <ActionSheet
          title={personMenu.name}
          onClose={() => setPersonMenu(null)}
          actions={[
            {
              label: "Open contact",
              onPress: () => onOpenRecord({ kind: "contact", id: personMenu.contactEntityId }),
            },
            ...(editable
              ? [
                  {
                    label: "Edit affiliation",
                    onPress: () =>
                      setEditingAffiliation({
                        otherEntityId: personMenu.contactEntityId,
                        name: personMenu.name,
                        title: personMenu.title,
                        isPrimary: personMenu.isPrimary,
                      }),
                  },
                  {
                    label: "Remove from account",
                    destructive: true,
                    onPress: () =>
                      write.mutate({
                        action: "removeAffiliation",
                        contactEntityId: personMenu.contactEntityId,
                        accountEntityId: accountId,
                      }),
                  },
                ]
              : []),
          ]}
        />
      ) : null}
      {editingAffiliation ? (
        <AffiliationForm
          scope={scope}
          mode={{ fixed: "account", accountEntityId: accountId }}
          affiliation={editingAffiliation}
          onClose={() => setEditingAffiliation(null)}
        />
      ) : null}
      {archiving ? (
        <ConfirmSheet
          title="Archive this account?"
          description="Archived accounts leave active lists and become read-only until restored."
          confirmLabel="Archive"
          destructive
          pending={write.isPending}
          error={write.error}
          onCancel={() => setArchiving(false)}
          onConfirm={() =>
            write.mutate(
              { action: "archive", entityId: accountId, archived: true },
              { onSuccess: () => setArchiving(false) },
            )
          }
        />
      ) : null}
    </View>
  );
}

/** The create-deal form with its own request state, so it can open from lists and records. */
export function NewDeal({
  organizationId,
  account,
  onOpenRecord,
  onClose,
}: {
  organizationId: string;
  account?: { entityId: string; name: string };
  onOpenRecord: OnOpenRecord;
  onClose: () => void;
}) {
  const scope = useRecordScope(organizationId);
  const write = useCreateDeal(scope);
  const [requestId] = useState(() => newRequestId());
  return (
    <DealForm
      scope={scope}
      initialAccount={account}
      pending={write.isPending}
      error={write.error}
      onClose={onClose}
      onSubmit={(draft) =>
        write.mutate(
          { requestId, ...draft },
          {
            onSuccess: (id) => {
              onClose();
              onOpenRecord({ kind: "deal", id });
            },
          },
        )
      }
    />
  );
}
