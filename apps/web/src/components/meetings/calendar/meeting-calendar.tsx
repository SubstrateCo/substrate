import type { CalendarData, MeetingDay } from "@substrate/contracts/meetings";

import { useQuery } from "@tanstack/react-query";

import { MeetingFilterBar } from "../meeting-filter-bar";
import { useMeetingsWorkspace } from "../meetings-workspace-context";
import { CalendarMonth } from "./calendar-month";
import { CalendarStats } from "./calendar-stats";
import { CalendarYear } from "./calendar-year";
import { isAccessFailure } from "@/api/access-failure";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNow } from "@/hooks/use-now";
import { formatMonthYear, formatDateOnly, parseDateOnly } from "@/lib/format/date";
import type { MeetingSearch } from "@/lib/meetings/navigation";
import { ChartNoAxesColumnIncreasing, ChevronLeft, ChevronRight } from "lucide-react";

type CalendarScale = NonNullable<MeetingSearch["scale"]>;

function CalendarSummary({ data, scale }: { data: CalendarData; scale: CalendarScale }) {
  return (
    <>
      <strong className="font-medium text-foreground">
        {data.count} {data.count === 1 ? "meeting" : "meetings"}
      </strong>{" "}
      {scale === "year" ? "across the year" : "this month"} · {data.people} other{" "}
      {data.people === 1 ? "person" : "people"}
    </>
  );
}

function CalendarBody({
  error,
  onRetry,
  data,
  scale,
  date,
  days,
  today,
}: {
  error: Error | null;
  onRetry: () => void;
  data: CalendarData | undefined;
  scale: CalendarScale;
  date: Date;
  days: Map<string, MeetingDay>;
  today: string;
}) {
  if (isAccessFailure(error)) return <ContentNotice title="Meeting calendar unavailable" />;
  if (error) return <ErrorState title="Couldn’t load meeting calendar" onRetry={onRetry} />;
  if (!data) return <LoadingState label="Loading meeting calendar" />;
  if (scale === "stats") return <CalendarStats date={date} data={data} />;
  if (scale === "month")
    return (
      <div className="mt-4">
        <CalendarMonth date={date} days={days} annual={false} today={today} />
      </div>
    );
  return <CalendarYear year={date.getFullYear()} data={data} days={days} today={today} />;
}

export function MeetingCalendar({
  phrase,
  searchPending,
}: {
  phrase: string;
  searchPending: boolean;
}) {
  const { queries, search, change } = useMeetingsWorkspace();
  const today = formatDateOnly(new Date(useNow(true, 60_000)));
  const month = search.month ?? today.slice(0, 7),
    scale = search.scale ?? "year",
    date = parseDateOnly(month + "-01")!,
    y = date.getFullYear(),
    m = date.getMonth();
  const query = useQuery({
    ...queries.calendar({
      period: scale === "year" ? month.slice(0, 4) : month,
      q: phrase || undefined,
      source: search.source,
    }),
    enabled: !searchPending,
  });
  const data = query.isSuccess ? query.data : undefined,
    days = new Map(data?.days.map((d) => [d.day, d]));
  function step(n: number) {
    change({
      month: formatDateOnly(
        new Date(y + (scale === "year" ? n : 0), m + (scale === "year" ? 0 : n), 1),
      ).slice(0, 7),
    });
  }
  return (
    <div className="@container mx-auto w-full max-w-400 tabular-nums">
      <div className="space-y-1 border-b pb-4">
        <p className="text-xs font-medium text-muted-foreground">Meeting calendar</p>
        <PageHeader
          className="items-end"
          title={
            <time dateTime={scale === "year" ? String(y) : month} className="text-calendar-period">
              {scale === "year" ? String(y) : formatMonthYear(date)}
            </time>
          }
          description={data ? <CalendarSummary data={data} scale={scale} /> : undefined}
          actions={
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <SegmentedControl
                aria-label="Calendar view"
                value={scale}
                options={[
                  { value: "year", label: "Year" },
                  { value: "month", label: "Month" },
                  { value: "stats", label: "Stats", icon: ChartNoAxesColumnIncreasing },
                ]}
                onValueChange={(v) => change({ scale: v })}
              />
              <div
                role="group"
                aria-label="Browse calendar dates"
                className="flex items-center gap-0.5"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Previous period"
                      onClick={() => step(-1)}
                    >
                      <ChevronLeft />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Previous period</TooltipContent>
                </Tooltip>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => change({ month: formatDateOnly(new Date()).slice(0, 7) })}
                >
                  Today
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Next period"
                      onClick={() => step(1)}
                    >
                      <ChevronRight />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Next period</TooltipContent>
                </Tooltip>
              </div>
            </div>
          }
        />
      </div>
      <div className="mt-3">
        <MeetingFilterBar clearable />
      </div>
      <CalendarBody
        error={query.error}
        onRetry={() => void query.refetch()}
        data={data}
        scale={scale}
        date={date}
        days={days}
        today={today}
      />
    </div>
  );
}
