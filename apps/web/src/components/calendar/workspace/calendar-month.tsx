import type { CalendarEventSummary } from "@substrate/contracts/calendar";

import { Link, type LinkProps } from "@tanstack/react-router";

import { CalendarColorDot } from "../calendar-color";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import {
  agendaTimeLabel,
  compareEvents,
  eventEnded,
  eventOnDay,
  eventTitle,
} from "@/lib/calendar/days";
import { formatDateOnly, formatDayLabel, formatWeekdayShort, isSameDay } from "@/lib/format/date";
import { cn } from "cn";

/** A Sunday-first month. Event links use the same selection and detail pane as the other views. */
export function CalendarMonth({
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
  const offset = days[0]!.getDay();
  const cells = Math.ceil((offset + days.length) / 7) * 7;
  const sorted = [...events].sort(compareEvents);
  return (
    <div
      role="region"
      aria-label="Month"
      className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
    >
      <div className="flex h-full min-w-xl flex-col">
        <div className="grid shrink-0 grid-cols-7 border-b">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="py-2 text-center text-xs text-muted-foreground">
              {formatWeekdayShort(new Date(2026, 10, 22 + index))}
            </div>
          ))}
        </div>
        <div
          className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 grid-rows-(--month-rows)"
          style={{ "--month-rows": `repeat(${cells / 7}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cells }, (_, index) => {
            const day =
              index >= offset && index < offset + days.length ? days[index - offset] : undefined;
            if (!day)
              return <div key={index} aria-hidden="true" className="border-r border-b bg-inset" />;
            const label = formatDayLabel(day, now);
            return (
              <section
                key={index}
                aria-label={label}
                className="flex min-h-0 min-w-0 flex-col border-r border-b p-1"
              >
                <time
                  dateTime={formatDateOnly(day)}
                  aria-current={isSameDay(day, now) ? "date" : undefined}
                  className={cn(
                    "mb-1 flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums",
                    isSameDay(day, now) && "bg-primary text-primary-foreground",
                  )}
                >
                  {day.getDate()}
                </time>
                <ul aria-label={label} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
                  {sorted
                    .filter((event) => eventOnDay(event, day))
                    .map((event) => {
                      const selected = event.entityId === selectedEventId;
                      const title = eventTitle(event.title);
                      const time = agendaTimeLabel(event, day);
                      return (
                        <li key={event.entityId}>
                          <Item asChild size="xs">
                            <Link
                              {...eventLink(event)}
                              aria-current={selected ? "true" : undefined}
                              aria-label={`${title}, ${time}`}
                              title={`${title} · ${time}`}
                              className={cn(
                                selected &&
                                  "[a]:bg-row-selected [a]:text-row-selected-foreground [a]:hover:bg-row-selected [a]:focus-visible:bg-row-selected",
                              )}
                            >
                              <ItemMedia>
                                <CalendarColorDot color={event.color} />
                              </ItemMedia>
                              <ItemContent className="min-w-0">
                                <ItemTitle className="w-full">
                                  <span
                                    className={cn(
                                      "min-w-0 truncate text-xs",
                                      eventEnded(event, now) &&
                                        !selected &&
                                        "text-muted-foreground",
                                      event.status === "cancelled" && "line-through",
                                    )}
                                  >
                                    {title}
                                  </span>
                                </ItemTitle>
                                <span className="truncate text-xs text-muted-foreground">
                                  {time}
                                </span>
                              </ItemContent>
                            </Link>
                          </Item>
                        </li>
                      );
                    })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
