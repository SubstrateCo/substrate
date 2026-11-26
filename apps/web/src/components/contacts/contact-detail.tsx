import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { ContactMethods } from "./contact-methods";
import { ContactMeetings } from "@/components/calendar/contact/contact-meetings";
import { WorkDiscussions } from "@/components/context/discussions/work-discussions";
import { AffiliationEditor } from "@/components/crm/affiliation-editor";
import { CrmActivity } from "@/components/crm/crm-activity";
import { crmResource } from "@/components/crm/crm-resource";
import { FollowUps } from "@/components/crm/follow-ups";
import { recordChangeDialog, type RecordChangeDialog } from "@/components/crm/record-change-dialog";
import { RecordChangeDialogs } from "@/components/crm/record-change-dialogs";
import { RecordDetailView, RecordDetailLoading } from "@/components/crm/record-detail-view";
import { ContentNotice } from "@/components/feedback/content-notice";
import { InteractionEditor } from "@/components/interactions/interaction-editor";
import { InteractionHistory } from "@/components/interactions/interaction-history";
import { PublishInteraction } from "@/components/interactions/publish-interaction";
import {
  Property,
  RecordSection,
  RecordSectionAction,
  recordRows,
} from "@/components/layout/record-section";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { TextLink } from "@/components/ui/text-link";
import { AppAvailability } from "@/components/workspace/app-availability";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { crmLink } from "@/lib/navigation/record-links";
import { contactOptions } from "@/queries/contacts/options";
import { useRecordMutation } from "@/queries/records/mutations";
import { Plus } from "lucide-react";

export function ContactDetail({ entityId }: { entityId: string }) {
  const { organizationId } = useWorkspaceScope();
  const query = useQuery(contactOptions(organizationId, entityId));
  const apps = useOrganizationApps();
  const mutation = useRecordMutation(organizationId, "contacts");
  const [dialog, setDialog] = useState<RecordChangeDialog | "interaction" | "affiliation" | null>(
    null,
  );
  const { data, fallback, staleNotice } = crmResource(
    query,
    <RecordDetailLoading kind="contacts" />,
  );
  if (!data) return fallback;
  const { profile, affiliations, level } = data;
  const canEdit = level === "edit" || level === "owner";
  const archived = !!data.archivedAt;
  const change = recordChangeDialog(dialog);
  const canChange = canEdit && !archived;
  const open = (next: NonNullable<typeof dialog>) => {
    mutation.reset();
    setDialog(next);
  };
  return (
    <>
      <RecordDetailView
        entityId={entityId}
        kind="contacts"
        notice={staleNotice}
        name={profile.displayName}
        summary={profile.notes}
        archived={archived}
        canEdit={canEdit}
        level={level}
        onEdit={() => open("edit")}
        onArchive={() => open("archive")}
        properties={
          data.urls.length > 0 &&
          data.urls.map((url) => (
            <Property key={url.id} label={url.label || "Website"}>
              <TextLink variant="quiet" href={url.url} className="min-w-0 truncate">
                {url.url}
              </TextLink>
            </Property>
          ))
        }
      >
        <AppAvailability app="crm" variant="compact">
          <RecordSection
            aria-label="Contact accounts"
            title="Accounts"
            count={affiliations.length || undefined}
            actions={
              canChange && (
                <RecordSectionAction label="Link account" onClick={() => open("affiliation")}>
                  <Plus aria-hidden="true" />
                </RecordSectionAction>
              )
            }
          >
            {affiliations.length ? (
              <ul className={recordRows}>
                {affiliations.map(({ account, affiliation }) => (
                  <li key={account.entityId}>
                    <Item asChild size="xs">
                      <Link {...crmLink(organizationId, "accounts", account.entityId)}>
                        <ItemContent className="min-w-0">
                          <ItemTitle className="max-w-full min-w-0">{account.name}</ItemTitle>
                          <ItemDescription className="wrap-anywhere sm:hidden">
                            {affiliation.title}
                            {affiliation.isPrimary ? " · Primary" : ""}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions className="hidden sm:flex">
                          <span className="text-xs text-muted-foreground">
                            {affiliation.title}
                            {affiliation.isPrimary ? " · Primary" : ""}
                          </span>
                        </ItemActions>
                      </Link>
                    </Item>
                  </li>
                ))}
              </ul>
            ) : (
              <ContentNotice variant="inline" title="No linked accounts you can read" />
            )}
          </RecordSection>
        </AppAvailability>
        <ContactMethods
          contactEntityId={entityId}
          identifiers={data.identifiers}
          canEdit={canChange}
        />
        <InteractionHistory
          contactEntityId={entityId}
          canEdit={canChange}
          canDelete={!archived}
          onCreate={canChange ? () => open("interaction") : undefined}
        />
        <ContactMeetings contactEntityId={entityId} />
        <FollowUps entityId={entityId} canCreate={canChange} />
        <WorkDiscussions entityId={entityId}>
          {canChange && <PublishInteraction contactEntityId={entityId} />}
        </WorkDiscussions>
        <CrmActivity entityId={entityId} />
      </RecordDetailView>
      {change && (
        <RecordChangeDialogs
          dialog={change}
          kind="contacts"
          entityId={entityId}
          name={profile.displayName}
          archived={archived}
          record={profile}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "interaction" && (
        <InteractionEditor
          pending={mutation.isPending}
          error={mutation.error}
          onClose={() => setDialog(null)}
          onSubmit={(draft) =>
            mutation.mutate(
              { action: "createInteraction", organizationId, contactEntityId: entityId, ...draft },
              { onSuccess: () => setDialog(null) },
            )
          }
        />
      )}
      {dialog === "affiliation" && apps.enabled("crm") && (
        <AffiliationEditor contactEntityId={entityId} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
