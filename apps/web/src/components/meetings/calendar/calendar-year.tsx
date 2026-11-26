import type { CalendarData, MeetingDay } from "@substrate/contracts/meetings";

import { CalendarMonth } from "./calendar-month";
import { Heading } from "@/components/ui/heading";
import { Pressable } from "@/components/ui/pressable";
import { formatCalendarMonth, formatMonthYear, formatDateOnly } from "@/lib/format/date";
import type { ChangeMeetingView } from "@/lib/meetings/navigation";

export function CalendarYear({
  year,
  data,
  days,
  today,
  change,
}: {
  year: number;
  data: CalendarData;
  days: Map<string, MeetingDay>;
  today: string;
  change: ChangeMeetingView;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-3 pb-4 text-xs text-muted-foreground">
        <span>Choose a month to open its calendar, or a date for its meetings.</span>
        <span className="flex items-center gap-1.5">
          <small
            aria-hidden="true"
            className="grid size-3 place-items-center rounded-full bg-success leading-none font-medium text-card"
          >
            2
          </small>
          Meetings on a day
        </span>
      </div>
      <div
        aria-label={`${year} annual meeting map`}
        className="grid gap-x-7 gap-y-5.5 @min-[471px]:grid-cols-2 @min-[711px]:grid-cols-3 @min-[971px]:grid-cols-4"
      >
        {Array.from({ length: 12 }, (_, i) => {
          const d = new Date(year, i, 1),
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
                  className="underline-offset-4 hover:underline"
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
}
