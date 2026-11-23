import type { CalendarEventSummary } from "@substrate/contracts/calendar";

import { Link, type LinkProps } from "@tanstack/react-router";

import { CalendarColorDot } from "../calendar-color";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Tag } from "@/components/feedback/tag";
import { eventTitle, eventWhenLabel } from "@/lib/calendar/days";

/** The viewer's meetings with one contact, newest first. Each row opens the event. */
export function MeetingList({
  meetings,
  error,
  now,
  onRetry,
  meetingLink,
}: {
  meetings: readonly CalendarEventSummary[] | undefined;
  error: Error | null;
  now: number;
  onRetry: () => void;
  meetingLink: (meeting: CalendarEventSummary) => LinkProps;
}) {
  return (
    <section className="space-y-3" aria-label="Meetings">
      <h2 className="text-sm font-medium">Meetings</h2>
      {error && (
        <ErrorState
          compact
          title="Couldn’t load meetings"
          description="Try again to see your meetings with this contact."
          onRetry={onRetry}
        />
      )}
      {!error && !meetings && <LoadingState label="Loading meetings…" variant="compact" rows={2} />}
      {!error && meetings?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No meetings with this contact in your connected calendars
        </p>
      )}
      {!error && meetings && meetings.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {meetings.map((meeting) => (
            <li key={meeting.entityId}>
              <Link
                {...meetingLink(meeting)}
                className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-row-hover"
              >
                <CalendarColorDot color={meeting.color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {eventTitle(meeting.title)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {eventWhenLabel(meeting, now)}
                  </span>
                </span>
                {meeting.status === "cancelled" && <Tag>Cancelled</Tag>}
                {Date.parse(meeting.startsAt) > now && meeting.status !== "cancelled" && (
                  <Tag>Upcoming</Tag>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
