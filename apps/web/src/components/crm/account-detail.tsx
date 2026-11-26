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
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { accountOptions } from "@/queries/crm/options";

export function AccountDetail({ entityId }: { entityId: string }) {
  const { organizationId } = useWorkspaceScope();
  const query = useQuery(accountOptions(organizationId, entityId));
  const [dialog, setDialog] = useState<RecordChangeDialog | null>(null);
  const { data, fallback, staleNotice } = crmResource(
    query,
    <RecordDetailLoading kind="accounts" />,
  );
  if (!data) return fallback;
  const { account, contacts, deals, level } = data;
  const canEdit = level === "edit" || level === "owner";
  const archived = !!account.archivedAt;
  return (
    <>
      <RecordDetailView
        entityId={entityId}
        kind="accounts"
        notice={staleNotice}
        name={account.name}
        summary={account.summary}
        archived={archived}
        canEdit={canEdit}
        level={level}
        ownerRecord={{ kind: "account", ownerActorEntityId: account.ownerActorEntityId }}
        onEdit={() => setDialog("edit")}
        onArchive={() => setDialog("archive")}
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
                      <ItemActions className="max-w-full min-w-0">
                        <span className="text-xs wrap-anywhere text-muted-foreground">
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
            <RecordList kind="deals" rows={deals.map((deal) => ({ ...deal, name: deal.title }))} />
          ) : (
            <ContentNotice variant="inline" title="No deals you can read" />
          )}
        </RecordSection>
        <FollowUps entityId={entityId} canCreate={canEdit && !archived} />
        <InteractionRollup entityId={entityId} kind="account" />
        <WorkDiscussions entityId={entityId} />
        <CrmActivity entityId={entityId} />
      </RecordDetailView>
      {dialog && (
        <RecordChangeDialogs
          dialog={dialog}
          kind="accounts"
          entityId={entityId}
          name={account.name}
          archived={archived}
          record={account}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
