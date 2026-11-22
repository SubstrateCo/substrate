import { barX, barY, defineChart, stack } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";

import { useMemo } from "react";

import { interactionKinds, interactionTypes, type InteractionActivity } from "./interaction-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatShortDate, parseDateOnly } from "@/lib/format/date";

function activityChart(activity: InteractionActivity["activity"], dates: string[]) {
  const rows = dates.flatMap((day) =>
    interactionKinds.map((kind) => ({
      day,
      type: interactionTypes[kind].label,
      count: activity.find((row) => row.day === day && row.kind === kind)?.count ?? 0,
    })),
  );
  return defineChart({
    theme: {
      foreground: "var(--muted-foreground)",
      muted: "var(--muted-foreground)",
      grid: "var(--border)",
      background: "var(--card)",
    },
    marks: [
      barY(rows, {
        x: "day",
        y: "count",
        color: "type",
        layout: stack({ order: interactionKinds.map((k) => interactionTypes[k].label) }),
        key: (row) => `${row.day}:${row.type}`,
      }),
    ],
    scales: {
      x: {
        scale: scaleBand<string>().domain(dates).padding(0.35),
        axis: {
          line: false,
          ticks: { size: 0, format: (value) => formatShortDate(parseDateOnly(value)!) },
          tickLabels: { fontSize: 11 },
        },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: { stroke: "var(--border)" },
        axis: {
          line: false,
          ticks: {
            size: 0,
            count: 4,
            format: (value) => (Number.isInteger(value) ? String(value) : ""),
          },
        },
      },
    },
    color: {
      domain: interactionKinds.map((k) => interactionTypes[k].label),
      range: interactionKinds.map((k) => interactionTypes[k].color),
    },
    focus: "group-x",
    tooltip,
  });
}

function mixChart(activity: InteractionActivity["activity"]) {
  const rows = interactionKinds.map((kind) => ({
    type: interactionTypes[kind].label,
    count: activity.filter((row) => row.kind === kind).reduce((n, row) => n + row.count, 0),
  }));
  return defineChart({
    theme: {
      foreground: "var(--muted-foreground)",
      muted: "var(--muted-foreground)",
      grid: "var(--border)",
      background: "var(--card)",
    },
    marks: [barX(rows, { x: "count", y: "type", color: "type", key: "type" })],
    scales: {
      x: {
        scale: scaleLinear,
        nice: true,
        axis: {
          line: false,
          ticks: {
            count: 3,
            size: 0,
            format: (value) => (Number.isInteger(value) ? String(value) : ""),
          },
        },
      },
      y: {
        scale: scaleBand<string>()
          .domain(rows.map((r) => r.type))
          .padding(0.6),
        axis: { line: false, ticks: { size: 0 } },
      },
    },
    color: {
      domain: rows.map((r) => r.type),
      range: interactionKinds.map((k) => interactionTypes[k].color),
    },
    tooltip,
  });
}

export function InteractionChart({
  activity,
  dates,
}: {
  activity: InteractionActivity["activity"];
  dates: string[];
}) {
  const totals = interactionKinds.map((kind) =>
    activity.filter((row) => row.kind === kind).reduce((n, row) => n + row.count, 0),
  );
  const dateKey = dates.join(",");
  const definition = useMemo(
    () => activityChart(activity, dateKey.split(",")),
    [activity, dateKey],
  );
  const mixDefinition = useMemo(() => mixChart(activity), [activity]);
  return (
    <div className="grid min-w-0 shrink-0 grid-cols-1 gap-4 @2xl:grid-cols-4">
      <Card size="sm" className="min-w-0 @2xl:col-span-3">
        <CardHeader>
          <CardTitle>
            <h2>Activity by interaction type</h2>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Daily totals · stacked by type · your local time
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Chart
            definition={definition}
            height={180}
            ariaLabel={`Daily interaction activity over ${dates.length} days`}
          />
          <ul
            aria-label="Interaction type totals"
            className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"
          >
            {interactionKinds.map((kind, i) => (
              <li key={kind} className="flex items-center gap-1.5">
                <span className={interactionTypes[kind].textClass}>
                  <span className="block size-2 rounded-sm bg-current" aria-hidden />
                </span>
                {interactionTypes[kind].label} · {totals[i]}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card size="sm" className="hidden @2xl:flex">
        <CardHeader>
          <CardTitle>
            <h2>Interaction mix</h2>
          </CardTitle>
          <p className="text-xs text-muted-foreground">Count by type</p>
        </CardHeader>
        <CardContent>
          <Chart definition={mixDefinition} height={196} ariaLabel="Interaction counts by type" />
        </CardContent>
      </Card>
    </div>
  );
}
