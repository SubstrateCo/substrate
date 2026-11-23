import type { CalendarEventSummary } from "@substrate/contracts/calendar";

import { Link, type LinkProps } from "@tanstack/react-router";

import { CalendarColorDot } from "../calendar-color";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Tag } from "@/components/feedback/tag";
import { RecordSection, recordRows } from "@/components/layout/record-section";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
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
              <Item asChild size="xs">
                <Link {...meetingLink(meeting)}>
                  <ItemMedia>
                    <CalendarColorDot color={meeting.color} />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="max-w-full">{eventTitle(meeting.title)}</ItemTitle>
                    <ItemDescription>{eventWhenLabel(meeting, now)}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {meeting.status === "cancelled" && <Tag>Cancelled</Tag>}
                    {Date.parse(meeting.startsAt) > now && meeting.status !== "cancelled" && (
                      <Tag>Upcoming</Tag>
                    )}
                  </ItemActions>
                </Link>
              </Item>
            </li>
          ))}
        </ul>
      )}
    </RecordSection>
  );
}
