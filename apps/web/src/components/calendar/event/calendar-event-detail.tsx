import type { CalendarEventDetail as EventDetail } from "@substrate/contracts/calendar";

import type { ReactNode } from "react";

import { CalendarColorDot } from "../calendar-color";
import { CalendarAttendees } from "./calendar-attendees";
import { CalendarEventOutcome } from "./calendar-event-outcome";
import { Tag } from "@/components/feedback/tag";
import { PageSheetBody } from "@/components/layout/page-sheet";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { eventSpan, eventTitle, eventWhenLabel } from "@/lib/calendar/days";
import { plainTextDescription } from "@/lib/calendar/description";
import { formatTimeZone, localTimeZone } from "@/lib/format/date";
import { ArrowUpRight, Clock, MapPin, Video } from "lucide-react";

function Detail({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-3 py-1.5 text-sm">
      <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1 space-y-0.5">{children}</div>
    </div>
  );
}

export function CalendarEventDetail({ event, now }: { event: EventDetail; now: number }) {
  const zone = localTimeZone();
  const start = eventSpan(event).start;
  const description = plainTextDescription(event.description);
  const cancelled = event.status === "cancelled";
  return (
    <PageSheetBody>
      <div className="grid min-w-0 gap-6">
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarColorDot color={event.color} />
            <span className="truncate">{event.calendarName}</span>
            {event.kind === "from_gmail" && <span className="shrink-0">· Added by Gmail</span>}
          </div>
          <Heading level={2} variant="record" className="wrap-anywhere">
            {cancelled ? (
              <s className="text-muted-foreground">{eventTitle(event.title)}</s>
            ) : (
              eventTitle(event.title)
            )}
          </Heading>
          {(cancelled || event.status === "tentative") && (
            <Tag className="w-fit">{cancelled ? "Cancelled" : "Tentative"}</Tag>
          )}
          {description && (
            <p className="text-sm/relaxed wrap-anywhere whitespace-pre-wrap">{description}</p>
          )}
        </div>
        <div className="grid">
          <Detail icon={<Clock aria-hidden />}>
            <p>{eventWhenLabel(event, now)}</p>
            {!event.allDay && (
              <p className="text-xs text-muted-foreground">
                {`Times in ${formatTimeZone(zone, start)}`}
                {event.timeZone && event.timeZone !== zone
                  ? ` · Event time zone ${formatTimeZone(event.timeZone, start)}`
                  : ""}
              </p>
            )}
          </Detail>
          {event.location && (
            <Detail icon={<MapPin aria-hidden />}>
              <p className="wrap-anywhere">{event.location}</p>
            </Detail>
          )}
          {event.conferenceUrl && (
            <Detail icon={<Video aria-hidden />}>
              <Button size="sm" asChild>
                <a href={event.conferenceUrl} target="_blank" rel="noreferrer">
                  Join
                  <ArrowUpRight aria-hidden />
                </a>
              </Button>
            </Detail>
          )}
        </div>
        <CalendarEventOutcome
          outcome={event.outcome}
          kind={event.kind}
          interactions={event.interactions}
        />
        <CalendarAttendees attendees={event.attendees} outcome={event.outcome.state} />
      </div>
    </PageSheetBody>
  );
}
