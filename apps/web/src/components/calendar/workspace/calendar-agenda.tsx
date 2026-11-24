import type { CalendarEventSummary } from "@substrate/contracts/calendar";

import { Link, type LinkProps } from "@tanstack/react-router";

import { CalendarColorDot } from "../calendar-color";
import { ContentNotice } from "@/components/feedback/content-notice";
import { Tag } from "@/components/feedback/tag";
import { SettingsList } from "@/components/layout/settings-section";
import { Heading } from "@/components/ui/heading";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
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
    <div className="@container p-4 sm:p-6">
      <ol aria-label="Agenda" className="mx-auto w-full max-w-4xl space-y-6">
        {days.map((group) => {
          const label = formatDayLabel(group.day, now);
          const events = [...group.allDay, ...group.timed];
          const today = isSameDay(group.day, now);
          return (
            <li key={group.key} aria-labelledby={`agenda-${group.key}`} className="space-y-2">
              <Heading level={2} id={`agenda-${group.key}`} className="flex items-baseline gap-2">
                <span className={cn(today && "text-primary")}>{label}</span>
                {(label === "Today" || label === "Yesterday") && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {formatShortDate(group.day, now)}
                  </span>
                )}
              </Heading>
              {events.length === 0 ? (
                <ContentNotice variant="inline" title="No events" />
              ) : (
                <SettingsList>
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
                </SettingsList>
              )}
            </li>
          );
        })}
      </ol>
    </div>
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
      <Item asChild>
        <Link
          {...link}
          aria-current={selected ? "true" : undefined}
          className={cn(
            "items-start focus-visible:bg-row-hover",
            selected &&
              "[a]:bg-row-selected [a]:text-row-selected-foreground [a]:hover:bg-row-selected [a]:focus-visible:bg-row-selected",
          )}
        >
          <ItemMedia className="basis-full justify-start @min-[32rem]:w-36 @min-[32rem]:basis-auto">
            <span className="text-xs text-muted-foreground tabular-nums">
              {agendaTimeLabel(event, day)}
            </span>
          </ItemMedia>
          <ItemMedia>
            <CalendarColorDot color={event.color} className="mt-1.5" />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="max-w-full flex-wrap">
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
            </ItemTitle>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="truncate">{event.calendarName}</span>
              {event.location && (
                <span className="inline-flex max-w-full min-w-0 items-center gap-1">
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
          </ItemContent>
        </Link>
      </Item>
    </li>
  );
}
