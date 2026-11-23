import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { CrmActivity } from "./crm-activity";
import { crmResource } from "./crm-resource";
import { accessLabel } from "./crm-types";
import { FollowUps } from "./follow-ups";
import { InteractionRollup } from "./interaction-rollup";
import type { RecordChangeDialog } from "./record-change-dialog";
import { RecordChangeDialogs } from "./record-change-dialogs";
import { RecordDetailView, RecordDetailLoading } from "./record-detail-view";
import { RecordList } from "./record-list";
import { ContactLink } from "@/components/contacts/contact-link";
import { WorkDiscussions } from "@/components/context/discussions/work-discussions";
import { ContentNotice } from "@/components/feedback/content-notice";
import { NotSet, Property, RecordSection, recordRows } from "@/components/layout/record-section";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";
import { TextLink } from "@/components/ui/text-link";
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
  const { data, fallback, staleNotice } = crmResource(
    query,
    <RecordDetailLoading kind="accounts" />,
  );
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
        notice={staleNotice}
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
            <Property label="Domain">{account.domain || <NotSet />}</Property>
            <Property label="Website">
              {account.website ? (
                <TextLink variant="quiet" href={account.website} className="min-w-0 truncate">
                  {account.website}
                </TextLink>
              ) : (
                <NotSet />
              )}
            </Property>
            <Property label="Access">{accessLabel(level)}</Property>
          </>
        }
      >
        <RecordSection
          aria-label="Account contacts"
          title="Contacts"
          count={contacts.length || undefined}
        >
          {contacts.length ? (
            <ul className={recordRows}>
              {contacts.map(({ contact, affiliation }) => (
                <li key={contact.entityId}>
                  <Item asChild size="xs">
                    <ContactLink entityId={contact.entityId}>
                      <ItemContent className="min-w-0">
                        <ItemTitle className="max-w-full">{contact.displayName}</ItemTitle>
                      </ItemContent>
                      <ItemActions>
                        <span className="text-xs text-muted-foreground">
                          {affiliation.title}
                          {affiliation.isPrimary ? " · Primary account" : ""}
                        </span>
                      </ItemActions>
                    </ContactLink>
                  </Item>
                </li>
              ))}
            </ul>
          ) : (
            <ContentNotice variant="inline" title="No linked contacts you can read" />
          )}
        </RecordSection>
        <RecordSection aria-label="Account deals" title="Deals" count={deals.length || undefined}>
          {deals.length ? (
            <RecordList
              organizationId={organizationId}
              kind="deals"
              rows={deals.map((deal) => ({ ...deal, name: deal.title }))}
            />
          ) : (
            <ContentNotice variant="inline" title="No deals you can read" />
          )}
        </RecordSection>
        <FollowUps
          organizationId={organizationId}
          entityId={entityId}
          canCreate={canEdit && !archived}
        />
        <InteractionRollup organizationId={organizationId} entityId={entityId} kind="account" />
        <WorkDiscussions organizationId={organizationId} entityId={entityId} />
        <CrmActivity organizationId={organizationId} entityId={entityId} />
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
