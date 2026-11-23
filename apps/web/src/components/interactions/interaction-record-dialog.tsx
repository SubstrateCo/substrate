import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { InteractionConnections } from "./interaction-connections";
import { interactionOrigins, interactionTypes } from "./interaction-types";
import { MeetingSourceLink } from "@/components/calendar/meeting-source-link";
import { WorkDiscussions } from "@/components/context/discussions/work-discussions";
import { CopyLink } from "@/components/context/links/copy-link";
import { FollowUps } from "@/components/crm/follow-ups";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { modalDialogProps } from "@/components/feedback/modal-dialog";
import { Tag } from "@/components/feedback/tag";
import { RecordSection } from "@/components/layout/record-section";
import { Timestamp } from "@/components/time/timestamp";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { interactionLink } from "@/lib/navigation/record-links";
import { useInteractionSources } from "@/queries/calendar/interaction-sources";
import { interactionRecordOptions } from "@/queries/context/interactions";

export function InteractionRecordDialog({
  organizationId,
  entityId,
  onClose,
}: {
  organizationId: string;
  entityId: string;
  onClose: () => void;
}) {
  const query = useQuery(interactionRecordOptions(organizationId, entityId));
  const data = query.data;
  const apps = useOrganizationApps();
  const sources = useInteractionSources(
    organizationId,
    data ? [data.interaction] : [],
    apps.enabled("calendar"),
  );
  const modal = modalDialogProps({ onClose });
  return (
    <Dialog {...modal.root}>
      <DialogContent size="lg" {...modal.content}>
        <DialogHeader>
          <div className="flex items-center gap-1 pr-8">
            <DialogTitle>Interaction details</DialogTitle>
            {data && (
              <div className="ml-auto">
                <CopyLink link={interactionLink(organizationId, entityId)} grouped />
              </div>
            )}
          </div>
          <DialogDescription>
            Summary, source messages, linked records, and follow-ups.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {query.error && (
            <ErrorState
              title="Couldn’t open this interaction"
              onRetry={() => void query.refetch()}
            />
          )}
          {!query.error && !data && <LoadingState label="Loading interaction" />}
          {!query.error && data && (
            <>
              <div className="space-y-3">
                <Link
                  to="/interactions"
                  search={(previous) => ({
                    ...previous,
                    section: "person",
                    profileId: data.interaction.contactEntityId,
                    recordId: undefined,
                    // The record can be older than the current period.
                    days: "all",
                  })}
                  className="text-sm font-medium underline-offset-4 hover:underline"
                >
                  {data.interaction.contactName}
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{interactionTypes[data.interaction.kind].label}</span>
                  <Timestamp value={data.interaction.occurredAt} format="datetime" />
                  {data.interaction.endedAt && (
                    <>
                      <span>–</span>
                      <Timestamp value={data.interaction.endedAt} format="time" />
                    </>
                  )}
                  <Tag>{interactionOrigins[data.interaction.origin].tag}</Tag>
                </div>
                <MeetingSourceLink organizationId={organizationId} source={sources[entityId]} />
                <p className="text-sm/relaxed wrap-break-word whitespace-pre-wrap">
                  {data.interaction.summary}
                </p>
                <p className="text-xs text-muted-foreground">
                  Logged by {data.interaction.actor.displayName}
                </p>
              </div>
              <WorkDiscussions
                organizationId={organizationId}
                entityId={entityId}
                label="Source messages"
              />
              <FollowUps
                organizationId={organizationId}
                entityId={entityId}
                canCreate={!data.archived && (data.level === "owner" || data.level === "edit")}
              />
              <RecordSection aria-label="Linked records" title="Linked records">
                <InteractionConnections organizationId={organizationId} connections={data.links} />
              </RecordSection>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
