import { useQuery } from "@tanstack/react-query";

import { useState, type ReactNode } from "react";

import { InteractionConnections } from "./interaction-connections";
import { interactionOrigins, interactionTypes } from "./interaction-types";
import { MeetingSourceLink } from "@/components/calendar/meeting-source-link";
import { WorkDiscussions } from "@/components/context/discussions/work-discussions";
import { CopyLink } from "@/components/context/links/copy-link";
import { FollowUps } from "@/components/crm/follow-ups";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Tag } from "@/components/feedback/tag";
import {
  InteractionChangeDialog,
  type InteractionChange,
} from "@/components/interactions/interaction-change-dialog";
import { PageSheetBody, PageSheetHeader, usePageSheet } from "@/components/layout/page-sheet";
import { Property, PropertyList, RecordSection } from "@/components/layout/record-section";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Heading } from "@/components/ui/heading";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { interactionLink } from "@/lib/navigation/record-links";
import { useInteractionSources } from "@/queries/calendar/interaction-sources";
import { interactionRecordOptions, useInteractionMutation } from "@/queries/context/interactions";
import { Ellipsis, Pencil, Trash2 } from "lucide-react";

/** Interaction details in a `PageSheet`. The host renders the contact link, which depends on the page. */
export function InteractionDetail({
  organizationId,
  entityId,
  contact,
}: {
  organizationId: string;
  entityId: string;
  contact: (contact: { entityId: string; name: string }) => ReactNode;
}) {
  const sheet = usePageSheet();
  const query = useQuery(interactionRecordOptions(organizationId, entityId));
  const data = query.data;
  const apps = useOrganizationApps();
  const sources = useInteractionSources(
    organizationId,
    data ? [data.interaction] : [],
    apps.enabled("calendar"),
  );
  const mutation = useInteractionMutation(organizationId);
  const [change, setChange] = useState<InteractionChange | null>(null);
  const title = sheet?.label ?? "Interaction";
  if (query.error)
    return (
      <InteractionFrame>
        <PageSheetHeader title={title} />
        <PageSheetBody>
          <ErrorState title="Couldn’t open this interaction" onRetry={() => void query.refetch()} />
        </PageSheetBody>
      </InteractionFrame>
    );
  if (!data)
    return (
      <InteractionFrame>
        <PageSheetHeader title={title} />
        <PageSheetBody>
          <LoadingState label="Loading interaction" />
        </PageSheetBody>
      </InteractionFrame>
    );
  const { interaction } = data;
  const canEdit = !data.archived && (data.level === "owner" || data.level === "edit");
  // Authors delete their own interactions, and admins delete any.
  const canDelete = !data.archived && interaction.canDelete;
  const open = (action: InteractionChange["action"]) => {
    mutation.reset();
    setChange({ entityId, summary: interaction.summary, action });
  };
  const kind = interactionTypes[interaction.kind].label;
  return (
    <InteractionFrame>
      <PageSheetHeader
        title={title}
        actions={
          <>
            {canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Edit"
                    onClick={() => open("edit")}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit</TooltipContent>
              </Tooltip>
            )}
            <CopyLink link={interactionLink(organizationId, entityId)} grouped />
            {canDelete && (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="More actions">
                        <Ellipsis aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>More actions</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onSelect={() => open("delete")}>
                    <Trash2 aria-hidden="true" />
                    Delete interaction
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      <PageSheetBody>
        <div className="grid min-w-0 gap-6 wrap-anywhere">
          <div className="grid gap-2">
            <Heading level={2} variant="record" className="min-w-0">
              {interaction.kind === "other" ? "Interaction" : kind} with {interaction.contactName}
            </Heading>
            <p className="text-sm/relaxed wrap-break-word whitespace-pre-wrap">
              {interaction.summary}
            </p>
            <MeetingSourceLink organizationId={organizationId} source={sources[entityId]} />
          </div>
          <aside aria-label="Interaction properties">
            <PropertyList>
              <Property label="Contact">
                {contact({ entityId: interaction.contactEntityId, name: interaction.contactName })}
              </Property>
              <Property label="Type">{kind}</Property>
              <Property label="When">
                <span className="flex flex-wrap items-center gap-1">
                  <Timestamp value={interaction.occurredAt} format="datetime" />
                  {interaction.endedAt && (
                    <>
                      <span>–</span>
                      <Timestamp value={interaction.endedAt} format="time" />
                    </>
                  )}
                </span>
              </Property>
              <Property label="Origin">
                <Tag>{interactionOrigins[interaction.origin].tag}</Tag>
              </Property>
              <Property label="Logged by">{interaction.actor.displayName}</Property>
            </PropertyList>
          </aside>
          <FollowUps organizationId={organizationId} entityId={entityId} canCreate={canEdit} />
          <WorkDiscussions
            organizationId={organizationId}
            entityId={entityId}
            label="Source messages"
            emptyTitle="No source messages"
          />
          <RecordSection aria-label="Linked records" title="Linked records">
            <InteractionConnections organizationId={organizationId} connections={data.links} />
          </RecordSection>
        </div>
      </PageSheetBody>
      {change && (
        <InteractionChangeDialog
          organizationId={organizationId}
          change={change}
          mutation={mutation}
          onClose={() => setChange(null)}
          onDone={() => {
            setChange(null);
            if (change.action === "delete") sheet?.onClose();
          }}
        />
      )}
    </InteractionFrame>
  );
}

function InteractionFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col *:data-[slot=page-header]:shrink-0">
      {children}
    </div>
  );
}
