import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { ContactForm } from "./contact-form";
import { ContactMethods } from "./contact-methods";
import { AffiliationForm, type Affiliation } from "@/components/crm/affiliation-form";
import { CrmActivityLog } from "@/components/crm/crm-activity";
import { FollowUps } from "@/components/crm/follow-ups";
import { RecordConnections } from "@/components/crm/record-connections";
import { RecordDiscussions } from "@/components/crm/record-discussions";
import { InteractionForm } from "@/components/interactions/interaction-form";
import { InteractionRow } from "@/components/interactions/interaction-row";
import { PublishInteractionSheet } from "@/components/interactions/publish-interaction-sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useWorkspaceApps } from "@/features/records/apps";
import { canEdit } from "@/features/records/format";
import {
  recordQueries,
  useContactWrite,
  useCrmWrite,
  useInteractionWrite,
  useRecordScope,
} from "@/features/records/queries";
import { recordLinkActions } from "@/features/records/record-tools";
import type { OnOpenConversation, OnOpenRecord } from "@/features/records/types";
import { DetailHeader } from "@/features/records/ui/layout";
import { DetailSection, Property, Row } from "@/features/records/ui/rows";
import { ActionSheet, ConfirmSheet } from "@/features/records/ui/sheet";
import {
  ErrorState,
  LoadingRows,
  MutationError,
  Notice,
  SectionQuery,
} from "@/features/records/ui/states";
import { Archive, Building2, UserRound } from "lucide-react-native";

export function ContactDetailView({
  organizationId,
  contactId,
  onOpenRecord,
  onClose,
  onOpenConversation,
}: {
  organizationId: string;
  contactId: string;
  onOpenRecord: OnOpenRecord;
  onClose?: () => void;
  onOpenConversation?: OnOpenConversation;
}) {
  const scope = useRecordScope(organizationId);
  const apps = useWorkspaceApps(scope);
  const crm = apps.enabled("crm");
  const query = useQuery(recordQueries.contact(scope, contactId));
  const interactions = useInfiniteQuery(
    recordQueries.interactionTimeline(scope, { search: "", contactEntityId: contactId }),
  );
  const write = useContactWrite(scope);
  const crmWrite = useCrmWrite(scope);
  const interactionWrite = useInteractionWrite(scope);
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [affiliating, setAffiliating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [affiliationMenu, setAffiliationMenu] = useState<
    (Omit<Affiliation, "otherEntityId"> & { accountEntityId: string }) | null
  >(null);
  const [editingAffiliation, setEditingAffiliation] = useState<Affiliation | null>(null);

  if (query.isPending)
    return (
      <View className="flex-1 bg-surface">
        <DetailHeader kind="Contact" title="Loading…" icon={UserRound} onClose={onClose} />
        <LoadingRows label="Loading contact" />
      </View>
    );
  if (query.isError)
    return (
      <View className="flex-1 bg-surface">
        <DetailHeader kind="Contact" title="Contact" icon={UserRound} onClose={onClose} />
        <ErrorState error={query.error} noun="this contact" onRetry={() => void query.refetch()} />
      </View>
    );

  const contact = query.data;
  const { profile } = contact;
  const archived = !!contact.archivedAt;
  const editable = canEdit(contact.level) && !archived;
  const interactionRows = interactions.data?.pages.flatMap((page) => page.items) ?? [];
  const fullName = [
    profile.namePrefix,
    profile.givenName,
    profile.middleName,
    profile.familyName,
    profile.nameSuffix,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <View className="flex-1 bg-surface" testID="contact-detail">
      <DetailHeader
        kind="Contact"
        title={profile.displayName}
        icon={UserRound}
        onClose={onClose}
        onEdit={editable ? () => setEditing(true) : undefined}
        actions={[
          ...recordLinkActions(organizationId, { kind: "contact", id: contactId }),
          ...(editable
            ? [
                { label: "Log interaction", onPress: () => setLogging(true) },
                { label: "Record from discussion", onPress: () => setPublishing(true) },
              ]
            : []),
          ...(crm && canEdit(contact.level)
            ? [
                archived
                  ? {
                      label: "Restore contact",
                      onPress: () =>
                        write.mutate({ action: "archive", entityId: contactId, archived: false }),
                    }
                  : {
                      label: "Archive contact",
                      destructive: true,
                      onPress: () => setArchiving(true),
                    },
              ]
            : []),
        ]}
      />
      {archived ? (
        <Notice icon={Archive}>This contact is archived. Restore it to make changes.</Notice>
      ) : null}
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
      >
        {(write.error || crmWrite.error) && !editing && !archiving && !affiliating ? (
          <View className="px-4 pt-2">
            <MutationError error={write.error ?? crmWrite.error} />
          </View>
        ) : null}
        <View className="mt-2 border-t border-border">
          {fullName && fullName !== profile.displayName ? (
            <Property label="Full name" value={fullName} />
          ) : null}
          {profile.nickname ? <Property label="Nickname" value={profile.nickname} /> : null}
        </View>
        <DetailSection title="Notes">
          <Text className="px-4 py-3 text-sm" selectable>
            {profile.notes || "No notes."}
          </Text>
        </DetailSection>
        <ContactMethods scope={scope} contact={contact} editable={editable} />
        {crm ? (
          <DetailSection
            title="Accounts"
            count={contact.affiliations.length || undefined}
            action={
              editable
                ? { label: "Add to account", onPress: () => setAffiliating(true) }
                : undefined
            }
          >
            {contact.affiliations.length ? (
              contact.affiliations.map(({ affiliation, account }) => (
                <Row
                  key={affiliation.id}
                  title={account.name}
                  subtitle={
                    [affiliation.title, affiliation.isPrimary ? "Primary account" : null]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                  leading={<Icon as={Building2} className="size-4 text-muted-foreground" />}
                  onPress={() =>
                    setAffiliationMenu({
                      accountEntityId: account.entityId,
                      name: account.name,
                      title: affiliation.title,
                      isPrimary: affiliation.isPrimary,
                    })
                  }
                />
              ))
            ) : (
              <Text className="px-4 py-3 text-sm text-muted-foreground">
                Not linked to an account you can read.
              </Text>
            )}
          </DetailSection>
        ) : null}
        <DetailSection
          title="Interactions"
          count={interactionRows.length || undefined}
          action={
            editable ? { label: "Log interaction", onPress: () => setLogging(true) } : undefined
          }
        >
          <SectionQuery
            pending={interactions.isPending}
            error={interactions.error}
            noun="interactions"
            onRetry={() => void interactions.refetch()}
            emptyText={interactionRows.length ? null : "No interactions logged."}
          >
            {interactionRows.map((interaction) => (
              <InteractionRow
                key={interaction.entityId}
                interaction={interaction}
                showContact={false}
                onPress={() => onOpenRecord({ kind: "interaction", id: interaction.entityId })}
              />
            ))}
            {interactions.hasNextPage ? (
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                disabled={interactions.isFetchingNextPage}
                onPress={() => void interactions.fetchNextPage()}
              >
                <Text>
                  {interactions.isFetchingNextPage ? "Loading…" : "Show older interactions"}
                </Text>
              </Button>
            ) : null}
          </SectionQuery>
        </DetailSection>
        <RecordConnections
          scope={scope}
          entityId={contactId}
          editable={editable}
          onOpenRecord={onOpenRecord}
        />
        <RecordDiscussions
          scope={scope}
          entityId={contactId}
          onOpenConversation={onOpenConversation}
        />
        <FollowUps
          scope={scope}
          entityId={contactId}
          canCreate={editable}
          onOpenRecord={onOpenRecord}
        />
        {crm ? <CrmActivityLog scope={scope} entityId={contactId} /> : null}
        <View className="h-10" />
      </ScrollView>

      {editing ? (
        <ContactForm
          contact={profile}
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            setEditing(false);
          }}
          onSubmit={(draft) =>
            write.mutate(
              { action: "updateContact", entityId: contactId, ...draft },
              { onSuccess: () => setEditing(false) },
            )
          }
        />
      ) : null}
      {logging ? (
        <InteractionForm
          scope={scope}
          contact={{ entityId: contactId, name: profile.displayName }}
          pending={interactionWrite.isPending}
          error={interactionWrite.error}
          onClose={() => {
            interactionWrite.reset();
            setLogging(false);
          }}
          onSubmit={(draft) =>
            interactionWrite.mutate(
              { action: "createInteraction", ...draft },
              { onSuccess: () => setLogging(false) },
            )
          }
        />
      ) : null}
      {publishing ? (
        <PublishInteractionSheet
          organizationId={organizationId}
          contact={{ entityId: contactId, name: profile.displayName }}
          onOpenConversation={onOpenConversation}
          onClose={() => setPublishing(false)}
          onPublished={(id) => onOpenRecord({ kind: "interaction", id })}
        />
      ) : null}
      {affiliating ? (
        <AffiliationForm
          scope={scope}
          mode={{ fixed: "contact", contactEntityId: contactId }}
          onClose={() => setAffiliating(false)}
        />
      ) : null}
      {affiliationMenu ? (
        <ActionSheet
          title={affiliationMenu.name}
          onClose={() => setAffiliationMenu(null)}
          actions={[
            {
              label: "Open account",
              onPress: () => onOpenRecord({ kind: "account", id: affiliationMenu.accountEntityId }),
            },
            ...(editable
              ? [
                  {
                    label: "Edit affiliation",
                    onPress: () =>
                      setEditingAffiliation({
                        otherEntityId: affiliationMenu.accountEntityId,
                        name: affiliationMenu.name,
                        title: affiliationMenu.title,
                        isPrimary: affiliationMenu.isPrimary,
                      }),
                  },
                  {
                    label: "Remove from account",
                    destructive: true,
                    onPress: () =>
                      crmWrite.mutate({
                        action: "removeAffiliation",
                        contactEntityId: contactId,
                        accountEntityId: affiliationMenu.accountEntityId,
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
          mode={{ fixed: "contact", contactEntityId: contactId }}
          affiliation={editingAffiliation}
          onClose={() => setEditingAffiliation(null)}
        />
      ) : null}
      {archiving ? (
        <ConfirmSheet
          title="Archive this contact?"
          description="Archived contacts leave active lists and become read-only until restored."
          confirmLabel="Archive"
          destructive
          pending={write.isPending}
          error={write.error}
          onCancel={() => setArchiving(false)}
          onConfirm={() =>
            write.mutate(
              { action: "archive", entityId: contactId, archived: true },
              { onSuccess: () => setArchiving(false) },
            )
          }
        />
      ) : null}
    </View>
  );
}
