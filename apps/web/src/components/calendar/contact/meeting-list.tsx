import type { CalendarEventSummary } from "@substrate/contracts/calendar";

import { Link, type LinkProps } from "@tanstack/react-router";

import { CalendarColorDot } from "../calendar-color";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { ListBody } from "@/components/feedback/list-body";
import { LoadingState } from "@/components/feedback/loading-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
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
import { listPhase } from "@/lib/resource-state";

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
      <ListBody
        phase={listPhase({ items: meetings && [...meetings], error })}
        loading={<LoadingState label="Loading meetings" variant="compact" rows={2} />}
        error={<ErrorState variant="compact" title="Couldn’t load meetings" onRetry={onRetry} />}
        empty={
          <ContentNotice
            variant="inline"
            title="No meetings with this contact in your connected calendars"
          />
        }
        stale={<StaleNotice title="Couldn’t load meetings" onRetry={onRetry} />}
      >
        {(rows) => (
          <ul className={recordRows}>
            {rows.map((meeting) => (
              <li key={meeting.entityId}>
                <Item asChild size="xs">
                  <Link {...meetingLink(meeting)} className="flex-nowrap">
                    <ItemMedia>
                      <CalendarColorDot color={meeting.color} />
                    </ItemMedia>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="max-w-full">
                        <span className="truncate" title={eventTitle(meeting.title)}>
                          {eventTitle(meeting.title)}
                        </span>
                      </ItemTitle>
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
      </ListBody>
    </RecordSection>
  );
}
