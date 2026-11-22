import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { InteractionConnections } from "./interaction-connections";
import { interactionTypes } from "./interaction-types";
import { WorkDiscussions } from "@/components/context/discussions/work-discussions";
import { CopyLink } from "@/components/context/links/copy-link";
import { FollowUps } from "@/components/crm/follow-ups";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Tag } from "@/components/feedback/tag";
import { Timestamp } from "@/components/time/timestamp";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { interactionLink } from "@/lib/navigation/record-links";
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
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Interaction details</DialogTitle>
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
          {!query.error && !data && <LoadingState label="Loading interaction…" />}
          {!query.error && data && (
            <>
              <div className="space-y-3">
                <CopyLink link={interactionLink(organizationId, entityId)} />
                <Link
                  to="/interactions"
                  search={(previous) => ({
                    ...previous,
                    section: "person",
                    profileId: data.interaction.contactEntityId,
                    recordId: undefined,
                  })}
                  className="text-base font-medium underline-offset-4 hover:underline"
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
                  <Tag>
                    {data.interaction.origin === "manual" ? "Manual" : "Published from message"}
                  </Tag>
                </div>
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
              <section className="space-y-2" aria-label="Linked records">
                <h2 className="text-sm font-medium">Linked records</h2>
                <InteractionConnections organizationId={organizationId} connections={data.links} />
              </section>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
