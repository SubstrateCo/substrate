import type { CalendarEventSummary } from "@substrate/contracts/calendar";

import { Link, type LinkProps } from "@tanstack/react-router";

import { CalendarColorDot } from "../calendar-color";
import { ContentNotice } from "@/components/feedback/content-notice";
import { Tag } from "@/components/feedback/tag";
import { agendaTimeLabel, eventEnded, eventTitle, type AgendaDay } from "@/lib/calendar/days";
import { formatDayLabel, formatShortDate, isSameDay } from "@/lib/format/date";
import { cn } from "cn";
import { MapPin, Users, Video } from "lucide-react";

/** Days with events, in order. Each event opens its details beside the agenda. */
export function CalendarAgenda({
  days,
  now,
  selectedEventId,
  eventLink,
}: {
  days: readonly AgendaDay[];
  now: number;
  selectedEventId?: string;
  eventLink: (event: CalendarEventSummary) => LinkProps;
}) {
  return (
    <ol aria-label="Agenda" className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      {days.map((group) => {
        const label = formatDayLabel(group.day, now);
        const events = [...group.allDay, ...group.timed];
        const today = isSameDay(group.day, now);
        return (
          <li key={group.key} aria-labelledby={`agenda-${group.key}`} className="space-y-2">
            <h2
              id={`agenda-${group.key}`}
              className="flex items-baseline gap-2 text-sm font-semibold"
            >
              <span className={cn(today && "text-primary")}>{label}</span>
              {(label === "Today" || label === "Yesterday") && (
                <span className="text-xs font-normal text-muted-foreground">
                  {formatShortDate(group.day, now)}
                </span>
              )}
            </h2>
            {events.length === 0 ? (
              <ContentNotice variant="inline" title="No events" />
            ) : (
              <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                {events.map((event) => (
                  <AgendaRow
                    key={event.entityId}
                    event={event}
                    day={group.day}
                    ended={eventEnded(event, now)}
                    selected={event.entityId === selectedEventId}
                    link={eventLink(event)}
                  />
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function AgendaRow({
  event,
  day,
  ended,
  selected,
  link,
}: {
  event: CalendarEventSummary;
  day: Date;
  /** The event is over; it reads quieter than what is still to come. */
  ended: boolean;
  selected: boolean;
  link: LinkProps;
}) {
  const cancelled = event.status === "cancelled";
  return (
    <li>
      <Link
        {...link}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex items-start gap-3 px-4 py-2.5 transition-colors outline-none hover:bg-row-hover focus-visible:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
          selected && "bg-row-selected text-row-selected-foreground hover:bg-row-selected",
        )}
      >
        <span className="w-36 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">
          {agendaTimeLabel(event, day)}
        </span>
        <CalendarColorDot color={event.color} className="mt-1.5" />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "truncate text-sm font-medium",
                ended && !selected && "text-muted-foreground",
                cancelled && "text-muted-foreground line-through",
              )}
            >
              {eventTitle(event.title)}
            </span>
            {cancelled && <Tag>Cancelled</Tag>}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="truncate">{event.calendarName}</span>
            {event.location && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin aria-hidden className="size-3 shrink-0" />
                <span className="truncate">{event.location}</span>
              </span>
            )}
            {event.conferenceUrl && (
              <span className="inline-flex items-center gap-1">
                <Video aria-hidden className="size-3 shrink-0" />
                Video call
              </span>
            )}
            {event.attendeeCount > 1 && (
              <span className="inline-flex items-center gap-1">
                <Users aria-hidden className="size-3 shrink-0" />
                {`${event.attendeeCount} people`}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}
