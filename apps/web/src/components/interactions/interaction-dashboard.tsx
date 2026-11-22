import type { InteractionPeriod } from "@substrate/contracts/context/interactions";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { InteractionChart } from "./interaction-chart";
import { InteractionList } from "./interaction-list";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { formatShortDate } from "@/lib/format/date";
import {
  interactionActivityOptions,
  interactionTimelineOptions,
} from "@/queries/context/interactions";
import { Activity } from "lucide-react";

export function InteractionDashboard({
  period,
  dates,
  days,
}: {
  period: InteractionPeriod;
  dates: string[];
  days: "7" | "30";
}) {
  const activity = useQuery(interactionActivityOptions(period));
  const recent = useQuery(interactionTimelineOptions(period));
  if (activity.error)
    return (
      <ErrorState
        title="Couldn’t load interaction activity"
        onRetry={() => void activity.refetch()}
      />
    );
  if (!activity.data) return <LoadingState label="Loading interaction activity…" rows={4} />;
  const { summary } = activity.data;
  const minutes = Math.round(summary.recordedMinutes);
  const metrics = [
    {
      label: "Logged interactions",
      value: summary.total,
      hint: `${formatShortDate(period.from)} – ${formatShortDate(new Date(Date.parse(period.until) - 1))}`,
    },
    {
      label: "Contacts reached",
      value: summary.contacts,
      hint: "Distinct contacts in this period",
    },
    {
      label: "Meetings & calls",
      value: summary.meetingsAndCalls,
      hint: `${Math.floor(minutes / 60)}h ${minutes % 60}m with recorded duration`,
    },
    {
      label: "Published from messages",
      value: summary.published,
      hint: "Other records logged manually",
    },
  ];
  let recentContent;
  if (recent.error)
    recentContent = (
      <ErrorState title="Couldn’t load recent interactions" onRetry={() => void recent.refetch()} />
    );
  else if (!recent.data) recentContent = <LoadingState label="Loading recent interactions…" />;
  else
    recentContent = (
      <InteractionList
        rows={recent.data.items.slice(0, 4)}
        organizationId={period.organizationId}
      />
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <dl
        aria-label="Interaction summary"
        className="grid shrink-0 grid-cols-2 gap-y-3 rounded-xl border bg-card py-3 @3xl:grid-cols-4"
      >
        {metrics.map(({ label, value, hint }) => (
          <div key={label} className="space-y-1 px-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-medium tracking-tight tabular-nums">{value}</dd>
            <dd className="text-xs text-muted-foreground">{hint}</dd>
          </div>
        ))}
      </dl>
      {summary.total === 0 ? (
        <Card>
          <ContentNotice
            title="No interactions in this period"
            icon={Activity}
            description="Create an interaction or try a longer period."
          />
        </Card>
      ) : (
        <>
          <InteractionChart activity={activity.data.activity} dates={dates} />
          <Card size="sm" className="min-h-0 flex-1">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">Recent interactions</h2>
                <Button variant="link" size="sm" asChild>
                  <Link
                    to="/interactions"
                    search={{ workspaceId: period.organizationId, section: "timeline", days }}
                  >
                    View timeline
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">{recentContent}</div>
          </Card>
        </>
      )}
    </div>
  );
}
