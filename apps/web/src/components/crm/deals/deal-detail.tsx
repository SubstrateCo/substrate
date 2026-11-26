import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { CrmActivity } from "../crm-activity";
import { crmResource } from "../crm-resource";
import { accessLabel, dealAmount, outcomeLabel } from "../crm-types";
import { FollowUps } from "../follow-ups";
import { InteractionRollup } from "../interaction-rollup";
import { recordChangeDialog, type RecordChangeDialog } from "../record-change-dialog";
import { RecordChangeDialogs } from "../record-change-dialogs";
import { RecordDetailView, RecordDetailLoading } from "../record-detail-view";
import { DealTransition } from "./deal-transition";
import type { getDeal } from "@/api/crm/requests";
import { ContactLink } from "@/components/contacts/contact-link";
import { WorkDiscussions } from "@/components/context/discussions/work-discussions";
import { Tag } from "@/components/feedback/tag";
import { NotSet, Property } from "@/components/layout/record-section";
import { Timestamp } from "@/components/time/timestamp";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { formatDueDate } from "@/lib/format/date";
import { crmLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { dealOptions } from "@/queries/crm/options";
import { useActiveStages } from "@/queries/crm/stages";
import { useRecordMutation } from "@/queries/records/mutations";
import { ArrowRightLeft } from "lucide-react";

export function DealDetail({ entityId }: { entityId: string }) {
  const { organizationId } = useWorkspaceScope();
  const query = useQuery(dealOptions(organizationId, entityId));
  const { pipeline, options: stages } = useActiveStages(organizationId, true);
  const mutation = useRecordMutation(organizationId, "deals");
  const [dialog, setDialog] = useState<RecordChangeDialog | "transition" | null>(null);
  const { data, fallback, staleNotice } = crmResource(query, <RecordDetailLoading kind="deals" />);
  if (!data) return fallback;
  const { deal, account, contacts: participants, level } = data;
  const canEdit = level === "edit" || level === "owner";
  const archived = !!deal.archivedAt;
  const change = recordChangeDialog(dialog);
  const primaryContact = participants.find((entry) => entry.isPrimary)?.contact;
  const stageName = (stageId: string) =>
    resourceState(pipeline).data?.find((stage) => stage.id === stageId)?.name ??
    "Stage unavailable";
  const open = (next: NonNullable<typeof dialog>) => {
    mutation.reset();
    setDialog(next);
  };
  return (
    <>
      <RecordDetailView
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
        properties={<DealProperties data={data} stage={stageName(deal.stageId)} />}
      >
        <FollowUps entityId={entityId} canCreate={canEdit && !archived} />
        <InteractionRollup entityId={entityId} kind="deal" />
        <WorkDiscussions entityId={entityId} />
        <CrmActivity entityId={entityId} />
      </RecordDetailView>
      {change && (
        <RecordChangeDialogs
          dialog={change}
          kind="deals"
          entityId={entityId}
          name={deal.title}
          archived={archived}
          record={{
            ...deal,
            // The deal shows an account only when the viewer can read it.
            accountName: deal.accountEntityId ? account.name : undefined,
            contactEntityIds: participants.map(({ contact }) => contact.entityId),
            primaryContactEntityId: primaryContact?.entityId ?? null,
            primaryContactName: primaryContact?.displayName,
          }}
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
  data: { deal, account, contacts, level },
  stage,
}: {
  data: Awaited<ReturnType<typeof getDeal>>;
  stage: string;
}) {
  const { organizationId } = useWorkspaceScope();
  return (
    <>
      <Property label="Stage">{stage}</Property>
      <Property label="Outcome">{outcomeLabel(deal.outcome)}</Property>
      <Property label="Amount">
        {deal.amount === null ? <NotSet /> : dealAmount(deal.amount, deal.currency)}
      </Property>
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
              <li key={contact.entityId} className="flex min-w-0 flex-wrap items-center gap-2">
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
