import type { CalendarEventSummary } from "@substrate/contracts/calendar";

import { Link, type LinkProps } from "@tanstack/react-router";

import { useLayoutEffect, useRef } from "react";

import { calendarColor } from "../calendar-color";
import { compareEvents, eventEnded, eventOnDay, eventTitle } from "@/lib/calendar/days";
import {
  dayMinutes,
  initialScrollMinutes,
  layoutDay,
  nowMinutes,
  type PlacedEvent,
} from "@/lib/calendar/week-layout";
import {
  formatDayLabel,
  formatHour,
  formatTime,
  formatTimeRange,
  formatWeekdayShort,
  isSameDay,
} from "@/lib/format/date";
import { cn } from "cn";

const hours = Array.from({ length: 24 }, (_, hour) => hour);
const percent = (minutes: number) => `${(minutes / dayMinutes) * 100}%`;
// Hour labels sit 8px above their line; keep the first one in view when the grid opens.
const hourLabelOffset = 8;
// Blocks shorter than this show the title and start time on one line.
const compactBlockMinutes = 30;

/** Seven days on a time grid, with all-day events above it and a line at the current time. */
export function CalendarWeek({
  days,
  events,
  now,
  selectedEventId,
  eventLink,
}: {
  days: readonly Date[];
  events: readonly CalendarEventSummary[];
  now: number;
  selectedEventId?: string;
  eventLink: (event: CalendarEventSummary) => LinkProps;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const columns = days.map((day) => ({
    day,
    allDay: events.filter((event) => event.allDay && eventOnDay(event, day)).sort(compareEvents),
    placed: layoutDay(events, day),
  }));
  const scrollMinutes = initialScrollMinutes(columns.flatMap(({ placed }) => placed));
  const hasAllDay = columns.some(({ allDay }) => allDay.length > 0);
  const weekKey = days[0]?.getTime();
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element)
      element.scrollTop = Math.max(
        0,
        (element.scrollHeight * scrollMinutes) / dayMinutes - hourLabelOffset,
      );
    // Scroll once per week shown, not on every refresh of its events.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- scrollMinutes changes with events.
  }, [weekKey]);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
      <div className="flex min-h-0 min-w-xl flex-1 flex-col">
        <div className="flex shrink-0 border-b">
          <div className="w-14 shrink-0" />
          <div className="grid flex-1 grid-cols-7">
            {days.map((day) => {
              const today = isSameDay(day, now);
              return (
                <div
                  key={day.getTime()}
                  title={formatDayLabel(day, now)}
                  className="flex items-center justify-center gap-1.5 border-l py-2 text-xs text-muted-foreground"
                >
                  <span>{formatWeekdayShort(day)}</span>
                  <span
                    aria-current={today ? "date" : undefined}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-sm font-medium text-foreground tabular-nums",
                      today && "bg-primary text-primary-foreground",
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        {hasAllDay && (
          <div className="flex shrink-0 border-b">
            <div className="flex w-14 shrink-0 items-start justify-end px-2 py-1.5 text-xs text-muted-foreground">
              All day
            </div>
            <div className="grid flex-1 grid-cols-7">
              {columns.map(({ day, allDay }) => (
                <ul key={day.getTime()} className="min-w-0 space-y-0.5 border-l p-0.5">
                  {allDay.map((event) => (
                    <li key={event.entityId}>
                      <EventChip
                        event={event}
                        ended={eventEnded(event, now)}
                        link={eventLink(event)}
                        selected={event.entityId === selectedEventId}
                      />
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        )}
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative flex h-288">
            <div aria-hidden="true" className="w-14 shrink-0">
              {hours.map((hour) => (
                <div key={hour} className="relative h-12">
                  {hour > 0 && (
                    <span className="absolute -top-2 right-2 text-xs text-muted-foreground tabular-nums">
                      {formatHour(new Date(2000, 0, 1, hour))}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="grid flex-1 grid-cols-7">
              {columns.map(({ day, placed }) => (
                <DayColumn
                  key={day.getTime()}
                  day={day}
                  placed={placed}
                  now={now}
                  selectedEventId={selectedEventId}
                  eventLink={eventLink}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DayColumn({
  day,
  placed,
  now,
  selectedEventId,
  eventLink,
}: {
  day: Date;
  placed: readonly PlacedEvent[];
  now: number;
  selectedEventId?: string;
  eventLink: (event: CalendarEventSummary) => LinkProps;
}) {
  const today = isSameDay(day, now);
  return (
    <ul aria-label={formatDayLabel(day, now)} className="relative min-w-0 border-l">
      {hours.map((hour) => (
        <li key={hour} aria-hidden="true" className="h-12 border-b border-border/60" />
      ))}
      {placed.map((item) => (
        <li
          key={item.event.entityId}
          style={{
            "--event-top": percent(item.top),
            "--event-height": percent(item.height),
            "--event-left": `${(item.column / item.columns) * 100}%`,
            "--event-width": `${100 / item.columns}%`,
          }}
          className="absolute top-(--event-top) left-(--event-left) h-(--event-height) w-(--event-width) p-px pr-1"
        >
          <EventBlock
            event={item.event}
            minutes={item.height}
            ended={eventEnded(item.event, now)}
            link={eventLink(item.event)}
            selected={item.event.entityId === selectedEventId}
          />
        </li>
      ))}
      {today && (
        <li
          aria-hidden="true"
          style={{ "--now-top": percent(nowMinutes(new Date(now))) }}
          className="pointer-events-none absolute inset-x-0 top-(--now-top) z-10 h-0.5 bg-primary"
        >
          <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-primary" />
        </li>
      )}
    </ul>
  );
}

const blockClass =
  "block size-full overflow-hidden rounded-md border-l-3 border-(--calendar-color) bg-(--calendar-color)/15 text-left text-xs text-foreground transition-colors outline-none hover:bg-(--calendar-color)/25 focus-visible:ring-2 focus-visible:ring-ring";
// Past events keep their color as a quieter fill, so what is still to come stands out.
const endedClass = "bg-(--calendar-color)/8 text-muted-foreground hover:bg-(--calendar-color)/15";

function EventBlock({
  event,
  minutes,
  ended,
  link,
  selected,
}: {
  event: CalendarEventSummary;
  minutes: number;
  ended: boolean;
  link: LinkProps;
  selected: boolean;
}) {
  const title = eventTitle(event.title);
  const time = formatTimeRange(event.startsAt, event.endsAt);
  const oneLine = minutes < 45;
  return (
    <Link
      {...link}
      aria-current={selected ? "true" : undefined}
      aria-label={`${title}, ${time}`}
      title={`${title} · ${time}`}
      style={{ "--calendar-color": calendarColor(event.color) }}
      className={cn(
        blockClass,
        "px-1.5 py-0.5",
        oneLine && "flex gap-1",
        minutes < compactBlockMinutes && "items-center py-0 leading-none",
        ended && endedClass,
        selected && "ring-2 ring-ring",
        event.status === "cancelled" && "line-through opacity-60",
      )}
    >
      {oneLine ? (
        <>
          <span className="max-w-full shrink-0 truncate font-medium">{title}</span>
          <span className="min-w-0 truncate text-muted-foreground">
            {formatTime(event.startsAt)}
          </span>
        </>
      ) : (
        <>
          <span className="block truncate font-medium">{title}</span>
          <span className="block truncate text-muted-foreground">{time}</span>
        </>
      )}
    </Link>
  );
}

function EventChip({
  event,
  ended,
  link,
  selected,
}: {
  event: CalendarEventSummary;
  ended: boolean;
  link: LinkProps;
  selected: boolean;
}) {
  return (
    <Link
      {...link}
      aria-current={selected ? "true" : undefined}
      title={eventTitle(event.title)}
      style={{ "--calendar-color": calendarColor(event.color) }}
      className={cn(
        blockClass,
        "truncate px-1.5 py-0.5 font-medium",
        ended && endedClass,
        selected && "ring-2 ring-ring",
        event.status === "cancelled" && "line-through opacity-60",
      )}
    >
      {eventTitle(event.title)}
    </Link>
  );
}
