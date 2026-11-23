import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { InteractionChangeDialog, type InteractionChange } from "./interaction-change-dialog";
import { MeetingSourceLink } from "@/components/calendar/meeting-source-link";
import { CrmResourceState } from "@/components/crm/crm-resource-state";
import { ContentNotice } from "@/components/feedback/content-notice";
import { InteractionLink } from "@/components/interactions/interaction-link";
import { InteractionRow } from "@/components/interactions/interaction-row";
import { RecordSection, RecordSectionAction, recordRows } from "@/components/layout/record-section";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { resourceState } from "@/lib/resource-state";
import { useInteractionSources } from "@/queries/calendar/interaction-sources";
import { useInteractionMutation, interactionsOptions } from "@/queries/context/interactions";
import { Pencil, Plus, Trash2 } from "lucide-react";

export function InteractionHistory({
  organizationId,
  contactEntityId,
  canEdit,
  canDelete,
  onCreate,
}: {
  organizationId: string;
  contactEntityId: string;
  canEdit: boolean;
  canDelete: boolean;
  onCreate?: () => void;
}) {
  const query = useQuery(interactionsOptions(organizationId, contactEntityId));
  const mutation = useInteractionMutation(organizationId);
  const apps = useOrganizationApps();
  const sources = useInteractionSources(
    organizationId,
    resourceState(query).data ?? [],
    apps.enabled("calendar"),
  );
  const [selected, setSelected] = useState<InteractionChange | null>(null);
  return (
    <RecordSection
      aria-label="Interaction history"
      title="Interaction history"
      actions={
        onCreate && (
          <RecordSectionAction label="New interaction" onClick={onCreate}>
            <Plus aria-hidden="true" />
          </RecordSectionAction>
        )
      }
    >
      <CrmResourceState
        compact
        noun="interactions"
        pending={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
      {!query.error && resourceState(query).data?.length === 0 && (
        <ContentNotice variant="inline" title="No interactions recorded" />
      )}
      <ol className={recordRows}>
        {(resourceState(query).data ?? []).map((interaction) => {
          // Authors delete their own interactions, and admins delete any.
          const deletable = canDelete && interaction.canDelete;
          return (
            <InteractionRow
              key={interaction.entityId}
              kind={interaction.kind}
              occurredAt={interaction.occurredAt}
              summary={
                <InteractionLink
                  entityId={interaction.entityId}
                  className="underline-offset-4 hover:underline"
                  aria-label={`Open interaction: ${interaction.summary}`}
                >
                  {interaction.summary}
                </InteractionLink>
              }
              source={
                <MeetingSourceLink
                  organizationId={organizationId}
                  source={sources[interaction.entityId]}
                  className="max-w-full"
                />
              }
              actions={
                (canEdit || deletable) && (
                  <RowActions label="Interaction actions">
                    {canEdit && (
                      <RowAction
                        label="Edit interaction"
                        onClick={() => {
                          mutation.reset();
                          setSelected({ ...interaction, action: "edit" });
                        }}
                      >
                        <Pencil aria-hidden />
                      </RowAction>
                    )}
                    {deletable && (
                      <RowAction
                        label="Delete interaction"
                        destructive
                        onClick={() => {
                          mutation.reset();
                          setSelected({ ...interaction, action: "delete" });
                        }}
                      >
                        <Trash2 aria-hidden />
                      </RowAction>
                    )}
                  </RowActions>
                )
              }
            />
          );
        })}
      </ol>
      {selected && (selected.action === "edit" ? canEdit : canDelete) && (
        <InteractionChangeDialog
          organizationId={organizationId}
          change={selected}
          mutation={mutation}
          onClose={() => setSelected(null)}
        />
      )}
    </RecordSection>
  );
}
