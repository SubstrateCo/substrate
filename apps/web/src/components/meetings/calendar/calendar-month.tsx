import type { MeetingDay } from "@substrate/contracts/meetings";

import { useState } from "react";

import { useMeetingsWorkspace } from "../meetings-workspace-context";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateOnly, formatDayLabel, formatWallTime } from "@/lib/format/date";
import { closedReader } from "@/lib/meetings/navigation";
import { cn } from "cn";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const arrowSteps = new Map([
  ["ArrowLeft", -1],
  ["ArrowRight", 1],
  ["ArrowUp", -7],
  ["ArrowDown", 7],
]);
export function CalendarMonth({
  date,
  days,
  annual,
  today,
}: {
  date: Date;
  days: Map<string, MeetingDay>;
  annual: boolean;
  today: string;
}) {
  const { change } = useMeetingsWorkspace();
  const y = date.getFullYear(),
    m = date.getMonth(),
    start = new Date(y, m, 1),
    offset = start.getDay(),
    length = new Date(y, m + 1, 0).getDate();
  const [focused, setFocused] = useState(
    today.startsWith(formatDateOnly(start).slice(0, 7)) ? Number(today.slice(-2)) : 1,
  );
  function focusDay(day: number) {
    const target = new Date(y, m, Math.min(length, Math.max(1, day)));
    document.getElementById(`map-${formatDateOnly(target)}`)?.focus();
  }
  return (
    <div className={annual ? "grid grid-cols-7" : "grid grid-cols-7 border-t border-l"}>
      {weekdays.map((w) => (
        <span
          key={w}
          aria-hidden
          className={cn(
            "border-b text-center font-normal text-muted-foreground",
            annual ? "mb-0.5 text-xs/4.5" : "border-r bg-sidebar py-1.5 text-xs",
          )}
        >
          {annual ? w[0] : w}
        </span>
      ))}
      {Array.from({ length: annual ? 42 : Math.ceil((offset + length) / 7) * 7 }, (_, i) => {
        const d = new Date(y, m, i + 1 - offset, 12),
          day = d.getDate(),
          key = formatDateOnly(d);
        if (d.getMonth() !== m)
          return (
            <span
              key={key}
              aria-hidden
              className={
                annual
                  ? "grid h-5.5 place-items-center text-xs text-muted-foreground/50 @max-[470px]:h-7.5"
                  : "border-r border-b bg-background"
              }
            >
              {annual ? day : ""}
            </span>
          );
        const info = days.get(key),
          count = info?.count ?? 0,
          label = `${formatDayLabel(d)} · ${count} ${count === 1 ? "meeting" : "meetings"}`;
        const open = () =>
          change({ ...closedReader, section: "all", day: key, month: key.slice(0, 7), offset: 0 });
        return annual ? (
          <AnnualDay
            key={key}
            dayKey={key}
            day={day}
            count={count}
            label={label}
            today={today === key}
            tabbable={day === focused}
            onFocus={() => setFocused(day)}
            onStep={(step) => focusDay(day + step)}
            onOpen={open}
          />
        ) : (
          <MonthDay
            key={key}
            dayKey={key}
            day={day}
            count={count}
            previews={info?.previews ?? []}
            label={label}
            onOpen={open}
          />
        );
      })}
    </div>
  );
}

type DayProps = {
  /** The day as YYYY-MM-DD. */
  dayKey: string;
  /** The day of the month. */
  day: number;
  count: number;
  label: string;
  /** Opens the day in All meetings. */
  onOpen: () => void;
};

/** A day in the year map: one roving-focus button with its meeting count. */
function AnnualDay({
  dayKey,
  day,
  count,
  label,
  today,
  tabbable,
  onFocus,
  onStep,
  onOpen,
}: DayProps & {
  today: boolean;
  tabbable: boolean;
  onFocus: () => void;
  /** Moves focus by a number of days within the month. */
  onStep: (step: number) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          id={`map-${dayKey}`}
          variant="ghost"
          aria-current={today ? "date" : undefined}
          size="calendar-day"
          className="w-full"
          aria-label={label}
          tabIndex={tabbable ? 0 : -1}
          onFocus={onFocus}
          onKeyDown={(event) => {
            const step = arrowSteps.get(event.key);
            if (step === undefined) return;
            event.preventDefault();
            onStep(step);
          }}
          onClick={onOpen}
        >
          <span
            className={cn(
              "relative inline-grid size-5 place-items-center rounded-full",
              today && "bg-primary font-medium text-primary-foreground",
            )}
          >
            {day}
            {count > 0 && (
              <small className="absolute -top-px left-4 z-1 inline-grid h-3 min-w-3 place-items-center rounded-full bg-success px-0.5 leading-none font-medium text-card">
                {count}
              </small>
            )}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** A day in the month grid: the day button, its meeting previews, and a link to the rest. */
function MonthDay({
  dayKey,
  day,
  count,
  previews,
  label,
  onOpen,
}: DayProps & { previews: MeetingDay["previews"] }) {
  const { change } = useMeetingsWorkspace();
  return (
    <div
      role="group"
      aria-label={label}
      className="@container/day relative flex min-h-28 min-w-0 flex-col items-stretch gap-0.75 border-r border-b bg-card p-1 md:min-h-32 md:p-1.5 2xl:min-h-36"
    >
      <Button
        size="calendar-day"
        variant="ghost"
        className="justify-between after:absolute after:inset-0"
        aria-label={label}
        onClick={onOpen}
      >
        <span className={cn(count > 0 && "font-medium text-foreground")}>{day}</span>
        {count > 0 && (
          <small className="text-muted-foreground @max-[82px]/day:sr-only">
            {count} {count === 1 ? "meeting" : "meetings"}
          </small>
        )}
      </Button>
      {previews.map((r) => (
        <Tooltip key={r.id}>
          <TooltipTrigger asChild>
            <Button
              size="calendar-entry"
              variant="accent"
              className="relative z-1 items-baseline justify-start"
              onClick={() =>
                change({
                  ...closedReader,
                  section: "all",
                  day: dayKey,
                  offset: 0,
                  meetingId: r.id,
                })
              }
            >
              <time
                dateTime={r.localStart}
                className="shrink-0 whitespace-nowrap text-muted-foreground @max-[135px]/day:sr-only"
              >
                {formatWallTime(r.localStart)}
              </time>{" "}
              <span className="line-clamp-2 min-w-0 wrap-anywhere">{r.title}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {formatWallTime(r.localStart)} · {r.title}
          </TooltipContent>
        </Tooltip>
      ))}
      {count > previews.length && (
        <Button
          variant="link"
          size="calendar-entry"
          className="relative z-1 justify-start"
          onClick={onOpen}
        >
          +{count - previews.length} more
        </Button>
      )}
    </div>
  );
}
