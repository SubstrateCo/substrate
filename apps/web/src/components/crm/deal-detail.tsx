import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { CrmActivity } from "./crm-activity";
import { crmResource } from "./crm-resource";
import { accessLabel, dealAmount, outcomeLabel } from "./crm-types";
import { DealTransition } from "./deal-transition";
import { FollowUps } from "./follow-ups";
import { InteractionRollup } from "./interaction-rollup";
import { recordChangeDialog, type RecordChangeDialog } from "./record-change-dialog";
import { RecordChangeDialogs } from "./record-change-dialogs";
import { RecordDetailView, RecordDetailLoading } from "./record-detail-view";
import type { RecordDraft } from "./record-editor";
import type { getDeal } from "@/api/crm/requests";
import { ContactLink } from "@/components/contacts/contact-link";
import { WorkDiscussions } from "@/components/context/discussions/work-discussions";
import { Tag } from "@/components/feedback/tag";
import { NotSet, Property } from "@/components/layout/record-section";
import { Timestamp } from "@/components/time/timestamp";
import { formatDueDate } from "@/lib/format/date";
import { crmLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { contactsOptions } from "@/queries/contacts/options";
import { accountsOptions, dealOptions, pipelineOptions } from "@/queries/crm/options";
import { useRecordMutation } from "@/queries/records/mutations";
import { ArrowRightLeft } from "lucide-react";

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
  const { data, fallback, staleNotice } = crmResource(query, <RecordDetailLoading kind="deals" />);
  if (!data) return fallback;
  const { deal, contacts: participants, level } = data;
  const canEdit = level === "edit" || level === "owner";
  const archived = !!deal.archivedAt;
  const change = recordChangeDialog(dialog);
  const pipelineData = resourceState(pipeline).data;
  const stages = (pipelineData ?? [])
    .filter((stage) => !stage.retired)
    .map((stage) => ({ value: stage.id, label: stage.name }));
  const stageName = (stageId: string) =>
    pipelineData?.find((stage) => stage.id === stageId)?.name ?? "Stage unavailable";
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
        notice={staleNotice}
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
        tools={
          canEdit && !archived
            ? [
                {
                  label: "Move deal",
                  icon: <ArrowRightLeft aria-hidden="true" />,
                  onSelect: () => open("transition"),
                },
              ]
            : []
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
        <WorkDiscussions organizationId={organizationId} entityId={entityId} />
        <CrmActivity organizationId={organizationId} entityId={entityId} />
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
      <Property label="Stage">{stage}</Property>
      <Property label="Outcome">{outcomeLabel(deal.outcome)}</Property>
      <Property label="Amount">{dealAmount(deal.amount, deal.currency)}</Property>
      <Property label="Expected close">
        {deal.expectedCloseDate ? formatDueDate(deal.expectedCloseDate)?.label : <NotSet />}
      </Property>
      {deal.closedAt && (
        <Property label="Actual close">
          <Timestamp value={deal.closedAt} format="datetime" />
        </Property>
      )}
      {deal.lostReason && <Property label="Lost reason">{deal.lostReason}</Property>}
      {deal.accountEntityId && (
        <Property label="Account">
          <Link
            {...crmLink(organizationId, "accounts", account.entityId)}
            className="underline-offset-4 hover:underline"
          >
            {account.name}
          </Link>
        </Property>
      )}
      {contacts.length > 0 && (
        <Property label="Contacts">
          <ul className="grid gap-1 py-1.5">
            {contacts.map(({ contact, isPrimary }) => (
              <li key={contact.entityId} className="flex items-center gap-2">
                <ContactLink
                  entityId={contact.entityId}
                  className="underline-offset-4 hover:underline"
                >
                  {contact.displayName}
                </ContactLink>
                {isPrimary && <Tag size="sm">Primary</Tag>}
              </li>
            ))}
          </ul>
        </Property>
      )}
      <Property label="Access">{accessLabel(level)}</Property>
    </>
  );
}
