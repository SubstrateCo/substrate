import { useQuery } from "@tanstack/react-query";

import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { CalendarSource, openCalendarConnection } from "./calendar-source";
import { InteractionSummaryForm } from "./interaction-form";
import { durationLabel, interactionIcons, originLabels } from "./interaction-row";
import { FollowUps } from "@/components/crm/follow-ups";
import { RecordConnections } from "@/components/crm/record-connections";
import { RecordDiscussions } from "@/components/crm/record-discussions";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { canEdit, formatDateTime, interactionKindLabels } from "@/features/records/format";
import { recordQueries, useInteractionWrite, useRecordScope } from "@/features/records/queries";
import { recordLinkActions } from "@/features/records/record-tools";
import { type OnOpenConversation, type OnOpenRecord } from "@/features/records/types";
import { DetailHeader } from "@/features/records/ui/layout";
import { DetailSection, Property, Row } from "@/features/records/ui/rows";
import { ConfirmSheet } from "@/features/records/ui/sheet";
import { ErrorState, LoadingRows, MutationError, Notice } from "@/features/records/ui/states";
import { Archive, Link2, MessagesSquare } from "lucide-react-native";

export function InteractionDetailView({
  organizationId,
  interactionId,
  onOpenRecord,
  onOpenConversation,
  onClose,
}: {
  organizationId: string;
  interactionId: string;
  onOpenRecord: OnOpenRecord;
  onOpenConversation?: OnOpenConversation;
  onClose?: () => void;
}) {
  const scope = useRecordScope(organizationId);
  const query = useQuery(recordQueries.interaction(scope, interactionId));
  const write = useInteractionWrite(scope);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (query.isPending)
    return (
      <View className="flex-1 bg-surface">
        <DetailHeader kind="Interaction" title="Loading…" icon={MessagesSquare} onClose={onClose} />
        <LoadingRows label="Loading interaction" />
      </View>
    );
  if (query.isError)
    return (
      <View className="flex-1 bg-surface">
        <DetailHeader
          kind="Interaction"
          title="Interaction"
          icon={MessagesSquare}
          onClose={onClose}
        />
        <ErrorState
          error={query.error}
          noun="this interaction"
          onRetry={() => void query.refetch()}
        />
      </View>
    );

  const { interaction, level, archived, links, source } = query.data;
  const calendarLinks = links.filter((link) => link.entityType === "calendar_event");
  const editable = canEdit(level) && !archived;
  const duration = durationLabel(interaction.occurredAt, interaction.endedAt);
  const kind = interactionKindLabels[interaction.kind];

  return (
    <View className="flex-1 bg-surface" testID="interaction-detail">
      <DetailHeader
        kind={`${kind} · ${interaction.contactName}`}
        title={interaction.summary.split("\n")[0] ?? kind}
        icon={interactionIcons[interaction.kind]}
        onClose={onClose}
        onEdit={editable ? () => setEditing(true) : undefined}
        actions={[
          ...recordLinkActions(organizationId, { kind: "interaction", id: interactionId }),
          ...(editable && interaction.canDelete
            ? [{ label: "Delete interaction", destructive: true, onPress: () => setDeleting(true) }]
            : []),
        ]}
      />
      {archived ? (
        <Notice icon={Archive}>This contact is archived. Restore it to change interactions.</Notice>
      ) : null}
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
      >
        {write.error && !editing && !deleting ? (
          <View className="px-4 pt-2">
            <MutationError error={write.error} />
          </View>
        ) : null}
        <View className="mt-2 border-t border-border">
          <Property
            label="Contact"
            value={interaction.contactName}
            onPress={() => onOpenRecord({ kind: "contact", id: interaction.contactEntityId })}
          />
          <Property label="Type" value={kind} />
          <Property label="When" value={formatDateTime(interaction.occurredAt)} />
          {duration ? <Property label="Duration" value={duration} /> : null}
          <Property label="Source" value={originLabels[interaction.origin]} />
          <Property label="Recorded by" value={interaction.actor.displayName} />
          {source && onOpenConversation ? (
            <Row
              title="Open source message"
              leading={<Icon as={MessagesSquare} className="size-4 text-muted-foreground" />}
              chevron
              onPress={() => onOpenConversation(source.conversationId, source.messageId)}
            />
          ) : null}
        </View>
        <DetailSection title="Summary">
          <Text className="px-4 py-3 text-sm" selectable>
            {interaction.summary}
          </Text>
        </DetailSection>
        {interaction.origin === "calendar_event" ? (
          <CalendarSource scope={scope} interactionId={interactionId} />
        ) : null}
        <RecordConnections
          scope={scope}
          entityId={interactionId}
          editable={editable}
          onOpenRecord={onOpenRecord}
        />
        {interaction.origin !== "calendar_event" && calendarLinks.length > 0 ? (
          <DetailSection title="Source connections">
            {calendarLinks.map((link) => (
              <Row
                key={link.entityId}
                title={link.title}
                subtitle="Calendar event · Opens the authorized web calendar"
                leading={<Icon as={Link2} className="size-4 text-muted-foreground" />}
                chevron
                onPress={() => openCalendarConnection(organizationId, link.entityId)}
              />
            ))}
          </DetailSection>
        ) : null}
        <FollowUps
          scope={scope}
          entityId={interactionId}
          canCreate={editable}
          onOpenRecord={onOpenRecord}
        />
        <RecordDiscussions
          scope={scope}
          entityId={interactionId}
          onOpenConversation={onOpenConversation}
        />
        <View className="h-10" />
      </ScrollView>

      {editing ? (
        <InteractionSummaryForm
          summary={interaction.summary}
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            setEditing(false);
          }}
          onSubmit={(summary) =>
            write.mutate(
              { action: "updateInteraction", entityId: interactionId, summary },
              { onSuccess: () => setEditing(false) },
            )
          }
        />
      ) : null}
      {deleting ? (
        <ConfirmSheet
          title="Delete this interaction?"
          description="It's removed from the contact's history for everyone. You can't undo this."
          confirmLabel="Delete"
          destructive
          pending={write.isPending}
          error={write.error}
          onCancel={() => setDeleting(false)}
          onConfirm={() =>
            write.mutate(
              { action: "deleteInteraction", entityId: interactionId },
              {
                onSuccess: () => {
                  setDeleting(false);
                  onClose?.();
                },
              },
            )
          }
        />
      ) : null}
    </View>
  );
}
