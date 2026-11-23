import type { CalendarEventDetail as EventDetail } from "@substrate/contracts/calendar";

import type { ReactNode } from "react";

import { CalendarColorDot } from "../calendar-color";
import { CalendarAttendees } from "./calendar-attendees";
import { CalendarEventOutcome } from "./calendar-event-outcome";
import { Tag } from "@/components/feedback/tag";
import { Button } from "@/components/ui/button";
import { eventSpan, eventTitle, eventWhenLabel } from "@/lib/calendar/days";
import { plainTextDescription } from "@/lib/calendar/description";
import { providerLabels } from "@/lib/calendar/labels";
import { formatTimeZone, localTimeZone } from "@/lib/format/date";
import { cn } from "cn";
import { ArrowUpRight, Clock, MapPin, Video } from "lucide-react";

function Detail({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1 space-y-0.5">{children}</div>
    </div>
  );
}

/** One event's details. The description is shown as plain text, never as markup. */
export function CalendarEventDetail({
  organizationId,
  event,
  now,
}: {
  organizationId: string;
  event: EventDetail;
  now: number;
}) {
  const zone = localTimeZone();
  const start = eventSpan(event).start;
  const description = plainTextDescription(event.description);
  const cancelled = event.status === "cancelled";
  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarColorDot color={event.color} />
          <span className="truncate">{event.calendarName}</span>
          {event.kind === "from_gmail" && <span className="shrink-0">· Added by Gmail</span>}
        </div>
        <h3
          className={cn(
            "text-base font-semibold wrap-break-word",
            cancelled && "text-muted-foreground line-through",
          )}
        >
          {eventTitle(event.title)}
        </h3>
        {(cancelled || event.status === "tentative") && (
          <Tag>{cancelled ? "Cancelled" : "Tentative"}</Tag>
        )}
      </div>
      <div className="space-y-3">
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
            <p className="wrap-break-word">{event.location}</p>
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
      {event.htmlLink && (
        <Button variant="outline" size="sm" asChild>
          <a href={event.htmlLink} target="_blank" rel="noreferrer">
            {`Open in ${providerLabels[event.provider]} Calendar`}
            <ArrowUpRight aria-hidden />
          </a>
        </Button>
      )}
      {description && (
        <section aria-label="Description" className="space-y-2">
          <h3 className="text-sm font-medium">Description</h3>
          <p className="text-sm/relaxed wrap-break-word whitespace-pre-wrap text-muted-foreground">
            {description}
          </p>
        </section>
      )}
      <CalendarEventOutcome
        organizationId={organizationId}
        outcome={event.outcome}
        kind={event.kind}
        interactions={event.interactions}
      />
      <CalendarAttendees
        organizationId={organizationId}
        attendees={event.attendees}
        outcome={event.outcome.state}
      />
    </div>
  );
}
