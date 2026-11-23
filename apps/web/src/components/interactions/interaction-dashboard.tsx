import type { InteractionPeriod } from "@substrate/contracts/context/interactions";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { InteractionChart } from "./interaction-chart";
import { InteractionDay } from "./interaction-day";
import { interactionDay } from "./interaction-period";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { formatShortDate } from "@/lib/format/date";
import { interactionActivityOptions } from "@/queries/context/interactions";
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
  const [selectedDay, setSelectedDay] = useState<string>();
  const activity = useQuery(interactionActivityOptions(period));
  if (activity.error)
    return (
      <ErrorState
        title="Couldn’t load interaction activity"
        onRetry={() => void activity.refetch()}
      />
    );
  if (!activity.data) return <LoadingState label="Loading interaction activity" rows={4} />;
  const { summary } = activity.data;
  // Opens on the latest day with interactions, so the table under the chart is not empty.
  const latestActive =
    dates
      .filter((date) => activity.data.activity.some((row) => row.day === date && row.count > 0))
      .at(-1) ?? dates.at(-1)!;
  const day = selectedDay && dates.includes(selectedDay) ? selectedDay : latestActive;
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
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <dl
        aria-label="Interaction summary"
        className="grid shrink-0 grid-cols-2 gap-2 @3xl:grid-cols-4"
      >
        {metrics.map(({ label, value, hint }) => (
          <div
            key={label}
            className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2"
            title={hint}
          >
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {summary.total === 0 ? (
        <ContentNotice
          title="No interactions in this period"
          icon={Activity}
          description="Create an interaction or try a longer period."
        />
      ) : (
        <>
          <InteractionChart
            activity={activity.data.activity}
            dates={dates}
            selectedDay={day}
            onSelectDay={setSelectedDay}
          />
          <section className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Heading level={2}>Day’s interactions</Heading>
              <Button variant="link" size="sm" className="-mr-2.5" asChild>
                <Link
                  to="/interactions"
                  search={{ workspaceId: period.organizationId, section: "timeline", days }}
                >
                  View timeline
                </Link>
              </Button>
            </div>
            <InteractionDay key={day} period={interactionDay(period, day)} />
          </section>
        </>
      )}
    </div>
  );
}
