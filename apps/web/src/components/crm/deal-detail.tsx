import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { CrmActivity } from "./crm-activity";
import { crmResource } from "./crm-resource-state";
import { accessLabel, dealAmount, outcomeLabel } from "./crm-types";
import { DealTransition } from "./deal-transition";
import { FollowUps } from "./follow-ups";
import { InteractionRollup } from "./interaction-rollup";
import {
  RecordChangeDialogs,
  recordChangeDialog,
  type RecordChangeDialog,
} from "./record-change-dialogs";
import { RecordDetailView, RecordDetailLoading, DetailProperty } from "./record-detail-view";
import type { RecordDraft } from "./record-editor";
import type { getDeal } from "@/api/crm/requests";
import { WorkDiscussions } from "@/components/context/discussions/work-discussions";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import { formatDueDate } from "@/lib/format/date";
import { crmLink, contactLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { contactsOptions } from "@/queries/contacts/options";
import { accountsOptions, dealOptions, pipelineOptions } from "@/queries/crm/options";
import { useRecordMutation } from "@/queries/records/mutations";
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
  const mutation = useRecordMutation(organizationId, "deals");
  const [dialog, setDialog] = useState<RecordChangeDialog | "transition" | null>(null);
  const [editingRecord, setEditingRecord] = useState<RecordDraft | null>(null);
  const accounts = useQuery({ ...accountsOptions(organizationId), enabled: dialog === "edit" });
  const contacts = useQuery({ ...contactsOptions(organizationId), enabled: dialog === "edit" });
  const { data, fallback } = crmResource(query, <RecordDetailLoading kind="deals" />);
  if (!data) return fallback;
  const { deal, contacts: participants, level } = data;
  const canEdit = level === "edit" || level === "owner";
  const archived = !!deal.archivedAt;
  const change = recordChangeDialog(dialog);
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
          <DealProperties
            organizationId={organizationId}
            data={data}
            stage={stageName(deal.stageId)}
          />
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
      </RecordDetailView>
      {change && (
        <RecordChangeDialogs
          dialog={change}
          kind="deals"
          organizationId={organizationId}
          entityId={entityId}
          name={deal.title}
          archived={archived}
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
          mutation={mutation}
          onClose={() => setDialog(null)}
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

function DealProperties({
  organizationId,
  data: { deal, account, contacts, level },
  stage,
}: {
  organizationId: string;
  data: Awaited<ReturnType<typeof getDeal>>;
  stage: string;
}) {
  return (
    <>
      <DetailProperty label="Stage">{stage}</DetailProperty>
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
      {deal.lostReason && <DetailProperty label="Lost reason">{deal.lostReason}</DetailProperty>}
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
      {contacts.length > 0 && (
        <DetailProperty label="Contacts">
          <ul className="space-y-1">
            {contacts.map(({ contact, isPrimary }) => (
              <li key={contact.entityId}>
                <Link
                  {...contactLink(organizationId, contact.entityId)}
                  className="underline underline-offset-4"
                >
                  {contact.displayName}
                </Link>
                {isPrimary && <span className="ml-2 text-xs text-muted-foreground">Primary</span>}
              </li>
            ))}
          </ul>
        </DetailProperty>
      )}
      <DetailProperty label="Access">
        {accessLabel(level)}. Related records keep their own access.
      </DetailProperty>
    </>
  );
}
