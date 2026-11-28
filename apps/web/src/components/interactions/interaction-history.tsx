import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { InteractionChangeDialog, type InteractionChange } from "./interaction-change-dialog";
import { MeetingSourceLink } from "@/components/calendar/meeting-source-link";
import { CrmResourceBoundary } from "@/components/crm/crm-resource-state";
import { ContentNotice } from "@/components/feedback/content-notice";
import { InteractionLink } from "@/components/interactions/interaction-link";
import { InteractionRow } from "@/components/interactions/interaction-row";
import { RecordSection, RecordSectionAction, recordRows } from "@/components/layout/record-section";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { resourceState } from "@/lib/resource-state";
import { useInteractionSources } from "@/queries/calendar/interaction-sources";
import { interactionsOptions } from "@/queries/context/interactions";
import { Pencil, Plus, Trash2 } from "lucide-react";

export function InteractionHistory({
  contactEntityId,
  canEdit,
  onCreate,
}: {
  contactEntityId: string;
  canEdit: boolean;
  onCreate?: () => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const query = useQuery(interactionsOptions(organizationId, contactEntityId));
  const state = resourceState(query);
  const apps = useOrganizationApps();
  const sources = useInteractionSources(organizationId, state.data ?? [], apps.enabled("calendar"));
  const [selected, setSelected] = useState<InteractionChange | null>(null);
  const change = openChange(selected, canEdit);
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
      <CrmResourceBoundary
        compact
        noun="interactions"
        state={state}
        onRetry={() => void query.refetch()}
      >
        {(interactions) =>
          interactions.length === 0 ? (
            <ContentNotice variant="inline" title="No interactions recorded" />
          ) : (
            <ol className={recordRows}>
              {interactions.map((interaction) => {
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
                        source={sources[interaction.entityId]}
                        className="max-w-full"
                      />
                    }
                    actions={
                      (canEdit || interaction.canDelete) && (
                        <RowActions label="Interaction actions">
                          {canEdit && (
                            <RowAction
                              label="Edit interaction"
                              onClick={() => setSelected({ ...interaction, action: "edit" })}
                            >
                              <Pencil aria-hidden />
                            </RowAction>
                          )}
                          {interaction.canDelete && (
                            <RowAction
                              label="Delete interaction"
                              destructive
                              onClick={() => setSelected({ ...interaction, action: "delete" })}
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
          )
        }
      </CrmResourceBoundary>
      {change && <InteractionChangeDialog change={change} onClose={() => setSelected(null)} />}
    </RecordSection>
  );
}

function openChange(change: InteractionChange | null, canEdit: boolean) {
  if (change?.action === "edit" && !canEdit) return null;
  return change;
}
