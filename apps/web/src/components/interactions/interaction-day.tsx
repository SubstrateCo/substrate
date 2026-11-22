import type {
  InteractionPeriod,
  InteractionTimeline,
} from "@substrate/contracts/context/interactions";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { InteractionTable } from "./interaction-table";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { interactionTimelineOptions } from "@/queries/context/interactions";
import { Activity } from "lucide-react";

export function InteractionDay({ period }: { period: InteractionPeriod }) {
  const [cursor, setCursor] = useState<
    Pick<InteractionTimeline, "beforeOccurredAt" | "beforeEntityId">
  >({});
  const query = useQuery(interactionTimelineOptions({ ...period, ...cursor }));
  if (query.error)
    return (
      <ErrorState
        title="Couldn’t load this day’s interactions"
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data) return <LoadingState label="Loading this day’s interactions…" />;
  const { items, nextCursor } = query.data;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length ? (
          <InteractionTable rows={items} organizationId={period.organizationId} />
        ) : (
          <ContentNotice
            title="No interactions on this day"
            icon={Activity}
            description="Select another bar to explore a different day."
          />
        )}
      </div>
      {(cursor.beforeEntityId || nextCursor) && (
        <div className="flex shrink-0 justify-between gap-3 px-4 pb-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!cursor.beforeEntityId}
            onClick={() => setCursor({})}
          >
            Newest
          </Button>
          {nextCursor && (
            <Button variant="outline" size="sm" onClick={() => setCursor(nextCursor)}>
              Older interactions
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
