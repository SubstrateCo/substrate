import { crmRecordCapabilities } from "@substrate/contracts/access/capabilities";

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
import type { RecordChangeDialog } from "@/components/crm/record-change-dialog";
import { RecordChangeDialogs } from "@/components/crm/record-change-dialogs";
import { RecordDetailView, RecordDetailLoading } from "@/components/crm/record-detail-view";
import type { RecordDraft } from "@/components/crm/record-editor";
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

type ContactDialog = RecordChangeDialog | "interaction" | "affiliation";

export function ContactDetail({ entityId }: { entityId: string }) {
  const { organizationId } = useWorkspaceScope();
  const query = useQuery(contactOptions(organizationId, entityId));
  const mutation = useRecordMutation(organizationId, "contacts");
  const [dialog, setDialog] = useState<ContactDialog | null>(null);
  const { data, fallback, staleNotice } = crmResource(
    query,
    <RecordDetailLoading kind="contacts" />,
  );
  if (!data) return fallback;
  const { profile, affiliations, level } = data;
  const archived = !!data.archivedAt;
  const capabilities = crmRecordCapabilities({ level, archived });
  const canChange = capabilities.canEdit;
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
        capabilities={capabilities}
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
          onCreate={canChange ? () => open("interaction") : undefined}
        />
        <ContactMeetings contactEntityId={entityId} />
        <FollowUps entityId={entityId} canCreate={canChange} />
        <WorkDiscussions entityId={entityId}>
          {canChange && <PublishInteraction contactEntityId={entityId} />}
        </WorkDiscussions>
        <CrmActivity entityId={entityId} />
      </RecordDetailView>
      <ContactDialogs
        dialog={dialog}
        entityId={entityId}
        profile={profile}
        archived={archived}
        mutation={mutation}
        onClose={() => setDialog(null)}
      />
    </>
  );
}

/** The open edit, archive, new interaction, or link account dialog of a contact. */
function ContactDialogs({
  dialog,
  entityId,
  profile,
  archived,
  mutation,
  onClose,
}: {
  dialog: ContactDialog | null;
  entityId: string;
  profile: RecordDraft & { displayName: string };
  archived: boolean;
  mutation: ReturnType<typeof useRecordMutation>;
  onClose: () => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const apps = useOrganizationApps();
  if (!dialog) return null;
  if (dialog === "interaction")
    return (
      <InteractionEditor
        pending={mutation.isPending}
        error={mutation.error}
        onClose={onClose}
        onSubmit={(draft) =>
          mutation.mutate(
            { action: "createInteraction", organizationId, contactEntityId: entityId, ...draft },
            { onSuccess: onClose },
          )
        }
      />
    );
  if (dialog === "affiliation") {
    // Accounts are part of CRM; the dialog closes if CRM is turned off while it is open.
    if (!apps.enabled("crm")) return null;
    return <AffiliationEditor contactEntityId={entityId} onClose={onClose} />;
  }
  return (
    <RecordChangeDialogs
      dialog={dialog}
      kind="contacts"
      entityId={entityId}
      name={profile.displayName}
      archived={archived}
      record={profile}
      onClose={onClose}
    />
  );
}
