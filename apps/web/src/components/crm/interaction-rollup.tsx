import type { CrmTimelineMode } from "@substrate/contracts/crm/input";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { CrmResourceState } from "./crm-resource-state";
import { MeetingSourceLink } from "@/components/calendar/meeting-source-link";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { contactLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { useInteractionSources } from "@/queries/calendar/interaction-sources";
import { crmTimelineOptions } from "@/queries/crm/options";

export function InteractionRollup({
  organizationId,
  entityId,
  kind,
}: {
  organizationId: string;
  entityId: string;
  kind: "account" | "deal";
}) {
  const [mode, setMode] = useState<CrmTimelineMode>(kind === "deal" ? "linked" : "participants");
  const [before, setBefore] = useState<{ beforeOccurredAt: string; beforeEntityId: string } | null>(
    null,
  );
  const query = useQuery(crmTimelineOptions(organizationId, entityId, mode, before));
  const rows = resourceState(query).data ?? [];
  const apps = useOrganizationApps();
  const sources = useInteractionSources(organizationId, rows, apps.enabled("calendar"));
  return (
    <section className="space-y-3" aria-label="Customer interaction timeline">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Customer interactions</h2>
        <SegmentedControl
          aria-label="Interaction scope"
          value={mode}
          onValueChange={(next) => {
            setMode(next);
            setBefore(null);
          }}
          options={[
            { value: "linked", label: "Explicitly linked" },
            { value: "participants", label: "Related contacts" },
          ]}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === "linked"
          ? "Interactions explicitly linked to this record. No customer-wide activity is implied."
          : "Readable interactions from related contacts and explicit links. A touch does not mean it advanced this pursuit."}
      </p>
      <CrmResourceState
        pending={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        loading={
          <div role="status" aria-label="Loading customer interactions">
            <ol className="divide-y" aria-hidden="true">
              {[0, 1, 2].map((key) => (
                <InteractionRow key={key}>
                  <div className="text-xs">
                    <SkeletonText width="10rem" />
                  </div>
                  <p className="text-sm">
                    <SkeletonText width="16rem" />
                  </p>
                </InteractionRow>
              ))}
            </ol>
          </div>
        }
      />
      {!query.isPending && !query.error && !rows.length && (
        <p className="text-sm text-muted-foreground">No interactions in this view</p>
      )}
      <ol className="divide-y">
        {rows.map((row) => (
          <InteractionRow key={row.entityId}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Timestamp value={row.occurredAt} format="datetime" />
              <Link
                {...contactLink(organizationId, row.contactEntityId)}
                className="underline underline-offset-4"
              >
                Open contact
              </Link>
            </div>
            <p className="text-sm whitespace-pre-wrap">{row.summary}</p>
            <MeetingSourceLink
              organizationId={organizationId}
              source={sources[row.entityId]}
              className="max-w-full"
            />
          </InteractionRow>
        ))}
      </ol>
      <div className="flex gap-2">
        {before && (
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => setBefore(null)}
          >
            Newest
          </Button>
        )}
        {rows.length === 50 && (
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => {
              const last = rows.at(-1);
              if (last)
                setBefore({ beforeOccurredAt: last.occurredAt, beforeEntityId: last.entityId });
            }}
          >
            Older interactions
          </Button>
        )}
      </div>
    </section>
  );
}

function InteractionRow({ children }: { children: React.ReactNode }) {
  return <li className="space-y-2 py-3">{children}</li>;
}
