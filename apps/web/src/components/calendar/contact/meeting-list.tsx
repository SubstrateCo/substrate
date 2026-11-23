import type { CalendarEventSummary } from "@substrate/contracts/calendar";

import { Link, type LinkProps } from "@tanstack/react-router";

import { CalendarColorDot } from "../calendar-color";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Tag } from "@/components/feedback/tag";
import { RecordSection, recordRow, recordRows } from "@/components/layout/record-section";
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
    <RecordSection aria-label="Meetings" title="Meetings" count={meetings?.length || undefined}>
      {error && <ErrorState compact title="Couldn’t load meetings" onRetry={onRetry} />}
      {!error && !meetings && <LoadingState label="Loading meetings" variant="compact" rows={2} />}
      {!error && meetings?.length === 0 && (
        <ContentNotice
          variant="inline"
          title="No meetings with this contact in your connected calendars"
        />
      )}
      {!error && meetings && meetings.length > 0 && (
        <ul className={recordRows}>
          {meetings.map((meeting) => (
            <li key={meeting.entityId}>
              <Link {...meetingLink(meeting)} className={recordRow}>
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
    </RecordSection>
  );
}
