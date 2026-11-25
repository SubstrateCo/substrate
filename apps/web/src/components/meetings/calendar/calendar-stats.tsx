import type { CalendarData } from "@substrate/contracts/meetings";

import { barY, defineChart, text } from "@tanstack/charts";
import { decorative } from "@tanstack/charts/mark/decorative";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { portal } from "@tanstack/charts/tooltip/portal";

import { useMemo } from "react";

import { ContentNotice } from "@/components/feedback/content-notice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Item } from "@/components/ui/item";
import { Pressable } from "@/components/ui/pressable";
import {
  formatDateOnly,
  formatDayLabel,
  formatMeetingDuration,
  formatMeetingHours,
  parseDateOnly,
} from "@/lib/format/date";
import { closedReader, type ChangeMeetingView } from "@/lib/meetings/navigation";
import { CalendarDays, ChevronRight } from "lucide-react";

export function CalendarStats({
  data,
  date,
  change,
}: {
  data: CalendarData;
  date: Date;
  change: ChangeMeetingView;
}) {
  const y = date.getFullYear(),
    m = date.getMonth();
  const definition = useMemo(() => {
    const byDay = new Map(data.days.map((d) => [d.day, d.count]));
    const rows = Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => {
      const day = formatDateOnly(new Date(y, m, i + 1));
      return { day, count: byDay.get(day) ?? 0 };
    });
    return defineChart({
      theme: {
        foreground: "var(--muted-foreground)",
        muted: "var(--muted-foreground)",
        grid: "var(--border)",
        background: "var(--card)",
      },
      marks: [
        barY(rows, { x: "day", y: "count", fill: "var(--chart-1)" }),
        decorative(
          text(
            rows.filter((r) => r.count > 0),
            {
              x: "day",
              y: "count",
              text: "count",
              dy: -8,
              fontSize: 10,
              fill: "var(--foreground)",
            },
          ),
        ),
      ],
      scales: {
        x: {
          scale: scaleBand<string>()
            .domain(rows.map((r) => r.day))
            .padding(0.25),
          axis: {
            ticks: {
              size: 0,
              format: (day) => {
                const n = Number(day.slice(-2));
                return n === 1 || n === rows.length || n % 5 === 0 ? String(n) : "";
              },
            },
          },
        },
        y: {
          scale: scaleLinear,
          domain: [0, Math.max(1, ...rows.map((r) => r.count))],
          nice: true,
          grid: true,
          axis: { ticks: { count: 4, format: (n) => (Number.isInteger(n) ? String(n) : "") } },
        },
      },
      tooltip: { use: tooltip, portal },
    });
  }, [data.days, y, m]);
  const go = (day: string) => change({ ...closedReader, section: "all", day, offset: 0 });
  return (
    <div className="space-y-5 pt-5">
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {(
          [
            ["Meeting days", data.days.length],
            [
              data.count === data.knownDurations
                ? "Total meeting duration"
                : "Known meeting duration",
              formatMeetingHours(data.count && !data.knownDurations ? null : data.durationMs),
            ],
            ["Meetings with transcripts", `${data.withTranscript} of ${data.count}`],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd
              className="mt-0.5 text-xl font-medium"
              title={
                k.endsWith("duration") && data.knownDurations
                  ? formatMeetingDuration(data.durationMs)
                  : undefined
              }
            >
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <Card size="sm">
        <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle>
            <Heading level={2} variant="inherit">
              Meetings per day
            </Heading>
          </CardTitle>
          <p className="text-xs text-muted-foreground">Select a day to see its meetings.</p>
        </CardHeader>
        <CardContent>
          <Chart
            definition={definition}
            height={175}
            ariaLabel="Daily meeting counts"
            ariaDescription="Use the arrow keys to explore days. Press Enter to open a day."
            onSelect={(point) => {
              if (point) go(point.datum.day);
            }}
          />
        </CardContent>
      </Card>
      {data.days.length > 0 && (
        <section>
          <Heading level={2} id="busiest-meeting-days">
            Busiest days
          </Heading>
          <ol aria-labelledby="busiest-meeting-days" className="divide-y">
            {[...data.days]
              .sort((a, b) => b.count - a.count || b.day.localeCompare(a.day))
              .slice(0, 3)
              .map((d) => (
                <li key={d.day}>
                  <Item asChild size="xs">
                    <Pressable
                      focus="inset"
                      className="text-left hover:bg-row-hover"
                      onClick={() => go(d.day)}
                    >
                      {formatDayLabel(parseDateOnly(d.day)!)}
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {d.count} {d.count === 1 ? "meeting" : "meetings"}
                      </span>
                      <ChevronRight aria-hidden className="size-3.5" />
                    </Pressable>
                  </Item>
                </li>
              ))}
          </ol>
        </section>
      )}
      {!data.count && (
        <ContentNotice
          icon={CalendarDays}
          title="No meetings this month"
          description="Choose another month or change your filters."
        />
      )}
    </div>
  );
}
