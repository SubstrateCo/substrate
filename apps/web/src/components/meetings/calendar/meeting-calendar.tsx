import { useQuery } from "@tanstack/react-query";

import type { ReactNode } from "react";

import { CalendarMonth } from "./calendar-month";
import { CalendarStats } from "./calendar-stats";
import { isAccessFailure } from "@/api/access-failure";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Pressable } from "@/components/ui/pressable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNow } from "@/hooks/use-now";
import {
  formatCalendarMonth,
  formatMonthYear,
  formatDateOnly,
  parseDateOnly,
} from "@/lib/format/date";
import type { ChangeMeetingView, MeetingSearch } from "@/lib/meetings/navigation";
import type { MeetingQueries } from "@/queries/meetings/options";
import { ChartNoAxesColumnIncreasing, ChevronLeft, ChevronRight } from "lucide-react";

export function MeetingCalendar({
  queries,
  search,
  change,
  phrase,
  searchPending,
  filters,
}: {
  queries: MeetingQueries;
  search: MeetingSearch;
  change: ChangeMeetingView;
  phrase: string;
  searchPending: boolean;
  filters: ReactNode;
}) {
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
  let content;
  if (isAccessFailure(query.error))
    content = <ContentNotice title="Meeting calendar unavailable" />;
  else if (query.error)
    content = (
      <ErrorState title="Couldn’t load meeting calendar" onRetry={() => void query.refetch()} />
    );
  else if (!data) content = <LoadingState label="Loading meeting calendar" />;
  else if (scale === "stats") content = <CalendarStats date={date} data={data} change={change} />;
  else if (scale === "month")
    content = (
      <div className="mt-4">
        <CalendarMonth date={date} days={days} annual={false} today={today} change={change} />
      </div>
    );
  else
    content = (
      <>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-3 pb-4 text-xs text-muted-foreground">
          <span>Choose a month to open its calendar, or a date for its meetings.</span>
          <span className="flex items-center gap-1.5">
            <small
              aria-hidden="true"
              className="grid size-3 place-items-center rounded-full bg-success leading-none font-semibold text-card"
            >
              2
            </small>
            Meetings on a day
          </span>
        </div>
        <div
          aria-label={`${y} annual meeting map`}
          className="grid gap-x-7 gap-y-5.5 @min-[471px]:grid-cols-2 @min-[711px]:grid-cols-3 @min-[971px]:grid-cols-4"
        >
          {Array.from({ length: 12 }, (_, i) => {
            const d = new Date(y, i, 1),
              key = formatDateOnly(d).slice(0, 7),
              stats = data.months.find((r) => r.month === key);
            return (
              <section key={key} aria-label={formatMonthYear(d)}>
                <Heading
                  level={2}
                  variant="section"
                  className="mb-1 flex flex-wrap items-baseline gap-x-1.5"
                >
                  <Pressable
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() => change({ month: key, scale: "month" })}
                  >
                    {formatCalendarMonth(d)}
                  </Pressable>
                  <span className="text-xs font-normal text-muted-foreground">
                    {stats?.count ?? 0} {stats?.count === 1 ? "meeting" : "meetings"} ·{" "}
                    {stats?.people ?? 0} {stats?.people === 1 ? "person" : "people"}
                  </span>
                </Heading>
                <CalendarMonth date={d} days={days} annual today={today} change={change} />
              </section>
            );
          })}
        </div>
      </>
    );
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
          description={
            data ? (
              <>
                <strong className="font-semibold text-foreground">
                  {data.count} {data.count === 1 ? "meeting" : "meetings"}
                </strong>{" "}
                {scale === "year" ? "across the year" : "this month"} · {data.people} other{" "}
                {data.people === 1 ? "person" : "people"}
              </>
            ) : undefined
          }
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
      {filters && <div className="mt-3">{filters}</div>}
      {content}
    </div>
  );
}
