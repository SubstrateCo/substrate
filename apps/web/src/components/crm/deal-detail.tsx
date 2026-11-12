import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { CrmActivity } from "./crm-activity";
import { CrmResourceState } from "./crm-resource-state";
import { accessLabel, dealAmount, outcomeLabel } from "./crm-types";
import { DealTransition } from "./deal-transition";
import { FollowUps } from "./follow-ups";
import { InteractionRollup } from "./interaction-rollup";
import { RecordArchive } from "./record-archive";
import { RecordDetailView, DetailProperty } from "./record-detail-view";
import { RecordEditor, type RecordDraft } from "./record-editor";
import { WorkDiscussions } from "@/components/context/discussions/work-discussions";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import { formatDueDate } from "@/lib/format/date";
import { crmLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { useCrmMutation } from "@/queries/crm/mutations";
import {
  accountsOptions,
  contactsOptions,
  dealOptions,
  pipelineOptions,
} from "@/queries/crm/options";
import { ArrowRight } from "lucide-react";

export function DealDetail({
  organizationId,
  entityId,
}: {
  organizationId: string;
  entityId: string;
}) {
  const query = useQuery(dealOptions(organizationId, entityId));
  const pipeline = useQuery(pipelineOptions(organizationId));
  const mutation = useCrmMutation(organizationId);
  const [dialog, setDialog] = useState<"edit" | "archive" | "transition" | null>(null);
  const [editingRecord, setEditingRecord] = useState<RecordDraft | null>(null);
  const accounts = useQuery({ ...accountsOptions(organizationId), enabled: dialog === "edit" });
  const contacts = useQuery({ ...contactsOptions(organizationId), enabled: dialog === "edit" });
  const state = resourceState(query);
  const data = state.data;
  if (!data || state.error)
    return (
      <CrmResourceState
        pending={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  const { deal, account, contacts: participants, events, level } = data;
  const canEdit = level === "edit" || level === "owner";
  const archived = !!deal.archivedAt;
  const stages = (pipeline.data ?? [])
    .filter((stage) => !stage.retired)
    .map((stage) => ({ value: stage.id, label: stage.name }));
  const stageName = (stageId: string) =>
    pipeline.data?.find((stage) => stage.id === stageId)?.name ?? "Stage unavailable";
  const open = (next: NonNullable<typeof dialog>) => {
    mutation.reset();
    if (next === "edit") {
      setEditingRecord({
        ...deal,
        contactEntityIds: participants.map(({ contact }) => contact.entityId),
        primaryContactEntityId:
          participants.find((entry) => entry.isPrimary)?.contact.entityId ?? null,
      });
    }
    setDialog(next);
  };
  return (
    <>
      <RecordDetailView
        organizationId={organizationId}
        entityId={entityId}
        kind="deals"
        name={deal.title}
        summary={deal.summary}
        archived={archived}
        canEdit={canEdit}
        level={level}
        ownerRecord={{
          kind: "deal",
          ownerActorEntityId: deal.ownerActorEntityId,
          version: deal.version,
        }}
        onEdit={() => open("edit")}
        onArchive={() => open("archive")}
        actions={
          canEdit &&
          !archived && (
            <Button size="sm" onClick={() => open("transition")}>
              <ArrowRight aria-hidden />
              Move deal
            </Button>
          )
        }
        properties={
          <>
            <DetailProperty label="Stage">{stageName(deal.stageId)}</DetailProperty>
            <DetailProperty label="Outcome">{outcomeLabel(deal.outcome)}</DetailProperty>
            <DetailProperty label="Amount">{dealAmount(deal.amount, deal.currency)}</DetailProperty>
            <DetailProperty label="Expected close">
              {deal.expectedCloseDate ? formatDueDate(deal.expectedCloseDate)?.label : "Not set"}
            </DetailProperty>
            {deal.closedAt && (
              <DetailProperty label="Actual close">
                <Timestamp value={deal.closedAt} format="datetime" />
              </DetailProperty>
            )}
            {deal.lostReason && (
              <DetailProperty label="Lost reason">{deal.lostReason}</DetailProperty>
            )}
            {deal.accountEntityId && (
              <DetailProperty label="Account">
                <Link
                  {...crmLink(organizationId, "accounts", account.entityId)}
                  className="underline underline-offset-4"
                >
                  {account.name}
                </Link>
              </DetailProperty>
            )}
            {participants.length > 0 && (
              <DetailProperty label="Contacts">
                <ul className="space-y-1">
                  {participants.map(({ contact, isPrimary }) => (
                    <li key={contact.entityId}>
                      <Link
                        {...crmLink(organizationId, "contacts", contact.entityId)}
                        className="underline underline-offset-4"
                      >
                        {contact.displayName}
                      </Link>
                      {isPrimary && (
                        <span className="ml-2 text-xs text-muted-foreground">Primary</span>
                      )}
                    </li>
                  ))}
                </ul>
              </DetailProperty>
            )}
            <DetailProperty label="Access">
              {accessLabel(level)}. Related records keep their own access.
            </DetailProperty>
          </>
        }
      >
        <FollowUps
          organizationId={organizationId}
          entityId={entityId}
          canCreate={canEdit && !archived}
        />
        <InteractionRollup organizationId={organizationId} entityId={entityId} kind="deal" />
        <CrmActivity organizationId={organizationId} entityId={entityId} />
        <WorkDiscussions organizationId={organizationId} entityId={entityId} />
        <section className="space-y-3" aria-label="Deal history">
          <h2 className="text-sm font-medium">Deal history</h2>
          <ol className="divide-y">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <span>
                  {event.fromStageId ? `${stageName(event.fromStageId)} → ` : "Created in "}
                  {stageName(event.toStageId)} · {outcomeLabel(event.toOutcome)}
                </span>
                <Timestamp
                  value={event.occurredAt}
                  format="datetime"
                  className="text-xs text-muted-foreground"
                />
              </li>
            ))}
          </ol>
        </section>
      </RecordDetailView>
      {dialog === "edit" && editingRecord && (
        <RecordEditor
          kind="deals"
          organizationId={organizationId}
          record={editingRecord}
          accounts={(resourceState(accounts).data ?? []).map((row) => ({
            value: row.entityId,
            label: row.name,
          }))}
          contacts={(resourceState(contacts).data ?? []).map(({ contact }) => ({
            value: contact.entityId,
            label: contact.displayName,
          }))}
          stages={stages}
          pending={mutation.isPending}
          error={mutation.error}
          onClose={() => setDialog(null)}
          onSubmit={(write) => mutation.mutate(write, { onSuccess: () => setDialog(null) })}
        />
      )}
      {dialog === "archive" && (
        <RecordArchive
          name={deal.title}
          archived={archived}
          pending={mutation.isPending}
          error={mutation.error}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            mutation.mutate(
              { action: "archive", organizationId, entityId, archived: !archived },
              { onSuccess: () => setDialog(null) },
            )
          }
        />
      )}
      {dialog === "transition" && (
        <DealTransition
          stageId={deal.stageId}
          outcome={deal.outcome}
          lostReason={deal.lostReason}
          stages={stages}
          pending={mutation.isPending}
          error={mutation.error}
          onClose={() => setDialog(null)}
          onSubmit={(stageId, outcome, lostReason, requestId) =>
            mutation.mutate(
              {
                action: "transitionDeal",
                organizationId,
                entityId,
                expectedVersion: deal.version,
                stageId,
                outcome,
                lostReason,
                requestId,
              },
              { onSuccess: () => setDialog(null) },
            )
          }
        />
      )}
    </>
  );
}
