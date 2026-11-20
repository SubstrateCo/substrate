import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { CrmActivity } from "./crm-activity";
import { crmResource } from "./crm-resource-state";
import { accessLabel } from "./crm-types";
import { FollowUps } from "./follow-ups";
import { InteractionRollup } from "./interaction-rollup";
import { RecordChangeDialogs, type RecordChangeDialog } from "./record-change-dialogs";
import { RecordDetailView, RecordDetailLoading, DetailProperty } from "./record-detail-view";
import { RecordList } from "./record-list";
import { WorkDiscussions } from "@/components/context/discussions/work-discussions";
import { contactLink } from "@/lib/navigation/record-links";
import { accountOptions } from "@/queries/crm/options";
import { useRecordMutation } from "@/queries/records/mutations";

export function AccountDetail({
  organizationId,
  entityId,
}: {
  organizationId: string;
  entityId: string;
}) {
  const query = useQuery(accountOptions(organizationId, entityId));
  const mutation = useRecordMutation(organizationId, "accounts");
  const [dialog, setDialog] = useState<RecordChangeDialog | null>(null);
  const { data, fallback } = crmResource(query, <RecordDetailLoading kind="accounts" />);
  if (!data) return fallback;
  const { account, contacts, deals, level } = data;
  const canEdit = level === "edit" || level === "owner";
  const archived = !!account.archivedAt;
  const open = (next: RecordChangeDialog) => {
    mutation.reset();
    setDialog(next);
  };
  return (
    <>
      <RecordDetailView
        organizationId={organizationId}
        entityId={entityId}
        kind="accounts"
        name={account.name}
        summary={account.summary}
        archived={archived}
        canEdit={canEdit}
        level={level}
        ownerRecord={{ kind: "account", ownerActorEntityId: account.ownerActorEntityId }}
        onEdit={() => open("edit")}
        onArchive={() => open("archive")}
        properties={
          <>
            <DetailProperty label="Domain">{account.domain || "Not set"}</DetailProperty>
            <DetailProperty label="Website">
              {account.website ? (
                <a
                  href={account.website}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  {account.website}
                </a>
              ) : (
                "Not set"
              )}
            </DetailProperty>
            <DetailProperty label="Access">
              {accessLabel(level)}. Customer links do not share access.
            </DetailProperty>
          </>
        }
      >
        <section className="space-y-3" aria-label="Account contacts">
          <h2 className="text-sm font-medium">Contacts</h2>
          {contacts.length ? (
            <ul className="divide-y rounded-lg border">
              {contacts.map(({ contact, affiliation }) => (
                <li
                  key={contact.entityId}
                  className="flex items-center justify-between gap-4 px-4 py-2"
                >
                  <Link
                    {...contactLink(organizationId, contact.entityId)}
                    className="text-sm font-medium hover:underline"
                  >
                    {contact.displayName}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {affiliation.title}
                    {affiliation.isPrimary ? " · Primary account" : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No linked contacts you can read</p>
          )}
        </section>
        <section className="space-y-3" aria-label="Account deals">
          <h2 className="text-sm font-medium">Deals</h2>
          <RecordList
            organizationId={organizationId}
            kind="deals"
            rows={deals.map((deal) => ({ ...deal, name: deal.title }))}
          />
        </section>
        <FollowUps
          organizationId={organizationId}
          entityId={entityId}
          canCreate={canEdit && !archived}
        />
        <InteractionRollup organizationId={organizationId} entityId={entityId} kind="account" />
        <CrmActivity organizationId={organizationId} entityId={entityId} />
        <WorkDiscussions organizationId={organizationId} entityId={entityId} />
      </RecordDetailView>
      {dialog && (
        <RecordChangeDialogs
          dialog={dialog}
          kind="accounts"
          organizationId={organizationId}
          entityId={entityId}
          name={account.name}
          archived={archived}
          record={account}
          mutation={mutation}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
