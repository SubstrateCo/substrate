import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { ContactMethods } from "./contact-methods";
import { WorkDiscussions } from "@/components/context/discussions/work-discussions";
import { InteractionEditor } from "@/components/context/interactions/interaction-editor";
import { InteractionHistory } from "@/components/context/interactions/interaction-history";
import { PublishInteraction } from "@/components/context/interactions/publish-interaction";
import { AffiliationEditor } from "@/components/crm/affiliation-editor";
import { CrmActivity } from "@/components/crm/crm-activity";
import { CrmResourceState } from "@/components/crm/crm-resource-state";
import { accessLabel } from "@/components/crm/crm-types";
import { FollowUps } from "@/components/crm/follow-ups";
import { RecordArchive } from "@/components/crm/record-archive";
import { RecordDetailView, DetailProperty } from "@/components/crm/record-detail-view";
import { RecordEditor } from "@/components/crm/record-editor";
import { Button } from "@/components/ui/button";
import { crmLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { contactOptions } from "@/queries/contacts/options";
import { useRecordMutation } from "@/queries/records/mutations";
import { Plus } from "lucide-react";

export function ContactDetail({
  organizationId,
  entityId,
}: {
  organizationId: string;
  entityId: string;
}) {
  const query = useQuery(contactOptions(organizationId, entityId));
  const mutation = useRecordMutation(organizationId, "contacts");
  const [dialog, setDialog] = useState<"edit" | "archive" | "interaction" | "affiliation" | null>(
    null,
  );
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
  const { profile, affiliations, level } = data;
  const canEdit = level === "edit" || level === "owner";
  const archived = !!data.archivedAt;
  const open = (next: NonNullable<typeof dialog>) => {
    mutation.reset();
    setDialog(next);
  };
  return (
    <>
      <RecordDetailView
        organizationId={organizationId}
        entityId={entityId}
        kind="contacts"
        name={profile.displayName}
        summary={profile.notes}
        archived={archived}
        canEdit={canEdit}
        level={level}
        onEdit={() => open("edit")}
        onArchive={() => open("archive")}
        actions={
          canEdit &&
          !archived && (
            <Button size="sm" onClick={() => open("interaction")}>
              <Plus aria-hidden />
              New interaction
            </Button>
          )
        }
        properties={
          <>
            {data.urls.map((url) => (
              <DetailProperty key={url.id} label={url.label || "Website"}>
                <a
                  href={url.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  {url.url}
                </a>
              </DetailProperty>
            ))}
            <DetailProperty label="Access">
              {accessLabel(level)}. Interactions use this contact’s access.
            </DetailProperty>
          </>
        }
      >
        <section className="space-y-3" aria-label="Contact accounts">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Accounts</h2>
            {canEdit && !archived && (
              <Button variant="outline" size="sm" onClick={() => open("affiliation")}>
                <Plus aria-hidden />
                Link account
              </Button>
            )}
          </div>
          {affiliations.length ? (
            <ul className="divide-y rounded-lg border">
              {affiliations.map(({ account, affiliation }) => (
                <li
                  key={account.entityId}
                  className="flex items-center justify-between gap-4 px-4 py-2"
                >
                  <Link
                    {...crmLink(organizationId, "accounts", account.entityId)}
                    className="text-sm font-medium hover:underline"
                  >
                    {account.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {affiliation.title}
                    {affiliation.isPrimary ? " · Primary" : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No linked accounts you can read</p>
          )}
        </section>
        <ContactMethods
          organizationId={organizationId}
          contactEntityId={entityId}
          identifiers={data.identifiers}
          canEdit={canEdit && !archived}
        />
        <InteractionHistory
          organizationId={organizationId}
          contactEntityId={entityId}
          canEdit={canEdit && !archived}
          canDelete={level === "owner" && !archived}
        />
        <FollowUps
          organizationId={organizationId}
          entityId={entityId}
          canCreate={canEdit && !archived}
        />
        <WorkDiscussions organizationId={organizationId} entityId={entityId}>
          {canEdit && !archived && (
            <PublishInteraction organizationId={organizationId} contactEntityId={entityId} />
          )}
        </WorkDiscussions>
        <CrmActivity organizationId={organizationId} entityId={entityId} />
      </RecordDetailView>
      {dialog === "edit" && (
        <RecordEditor
          kind="contacts"
          organizationId={organizationId}
          record={profile}
          accounts={[]}
          contacts={[]}
          stages={[]}
          pending={mutation.isPending}
          error={mutation.error}
          onClose={() => setDialog(null)}
          onSubmit={(write) => mutation.mutate(write, { onSuccess: () => setDialog(null) })}
        />
      )}
      {dialog === "archive" && (
        <RecordArchive
          name={profile.displayName}
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
      {dialog === "affiliation" && (
        <AffiliationEditor
          organizationId={organizationId}
          contactEntityId={entityId}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
