import { bandX, barY, defineChart, stack } from "@tanstack/charts";
import { decorative } from "@tanstack/charts/mark/decorative";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { portal } from "@tanstack/charts/tooltip/portal";

import { useMemo, useState } from "react";

import { interactionKinds, interactionTypes, type InteractionActivity } from "./interaction-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDayLabel, formatShortDate, parseDateOnly } from "@/lib/format/date";
import { ChevronLeft, ChevronRight } from "lucide-react";

function activityChart(
  activity: InteractionActivity["activity"],
  dates: string[],
  selectedDay: string,
  tooltipOffset: number,
) {
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
      decorative(
        bandX([{ day: selectedDay }], {
          x: "day",
          fill: "var(--muted-foreground)",
          fillOpacity: 0.12,
        }),
      ),
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
    maxFocusDistance: Number.POSITIVE_INFINITY,
    tooltip: {
      use: tooltip,
      portal,
      anchor: "group-center",
      placement: ["right", "left"],
      offset: tooltipOffset,
      sticky: false,
    },
  });
}

export function InteractionChart({
  activity,
  dates,
  selectedDay,
  onSelectDay,
}: {
  activity: InteractionActivity["activity"];
  dates: string[];
  selectedDay: string;
  onSelectDay: (day: string) => void;
}) {
  const [tooltipOffset, setTooltipOffset] = useState(12);
  const [input, setInput] = useState<"pointer" | "keyboard">("keyboard");
  const selectedIndex = dates.indexOf(selectedDay);
  const selectedDate = parseDateOnly(selectedDay)!;
  const dateKey = dates.join(",");
  const definition = useMemo(
    () => activityChart(activity, dateKey.split(","), selectedDay, tooltipOffset),
    [activity, dateKey, selectedDay, tooltipOffset],
  );
  return (
    <Card
      size="sm"
      className="min-w-0 shrink-0"
      data-chart-input={input}
      onPointerDownCapture={() => setInput("pointer")}
      onKeyDownCapture={() => setInput("keyboard")}
    >
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>
              <h2>Activity by interaction type</h2>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Select a bar to see that day’s interactions · your local time
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-xs"
                  aria-label="Previous day"
                  disabled={selectedIndex <= 0}
                  onClick={() => onSelectDay(dates[selectedIndex - 1]!)}
                >
                  <ChevronLeft aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous day</TooltipContent>
            </Tooltip>
            <time
              dateTime={selectedDay}
              className="w-14 shrink-0 text-center tabular-nums"
              aria-label={`Selected day: ${formatDayLabel(selectedDate)}`}
              aria-live="polite"
            >
              {formatShortDate(selectedDate, selectedDate)}
            </time>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-xs"
                  aria-label="Next day"
                  disabled={selectedIndex >= dates.length - 1}
                  onClick={() => onSelectDay(dates[selectedIndex + 1]!)}
                >
                  <ChevronRight aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next day</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Chart
          definition={definition}
          height={130}
          ariaLabel={`Daily interaction activity over ${dates.length} days`}
          ariaDescription="Use arrow keys to explore days, then Enter or Space to select a day."
          onSelect={(point) => {
            if (point) onSelectDay(point.datum.day);
          }}
          onRender={({ scene }) => setTooltipOffset(scene.scales.x!.bandwidth / 2 + 12)}
        />
      </CardContent>
    </Card>
  );
}
