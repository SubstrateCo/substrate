import { useQuery } from "@tanstack/react-query";

import { MeetingList } from "./meeting-list";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useNow } from "@/hooks/use-now";
import { eventDate } from "@/lib/calendar/days";
import { calendarLink } from "@/lib/navigation/record-links";
import { contactMeetingsOptions } from "@/queries/calendar/options";

/** A contact's meetings from the viewer's calendars, shown only while the Calendar app is on. */
export function ContactMeetings({
  organizationId,
  contactEntityId,
}: {
  organizationId: string;
  contactEntityId: string;
}) {
  const apps = useOrganizationApps();
  if (!apps.enabled("calendar")) return null;
  return <ContactMeetingList organizationId={organizationId} contactEntityId={contactEntityId} />;
}

function ContactMeetingList({
  organizationId,
  contactEntityId,
}: {
  organizationId: string;
  contactEntityId: string;
}) {
  const query = useQuery(contactMeetingsOptions(organizationId, contactEntityId));
  const now = useNow(true, 60_000);
  return (
    <MeetingList
      meetings={query.data}
      error={query.error}
      now={now}
      onRetry={() => void query.refetch()}
      meetingLink={(meeting) => calendarLink(organizationId, meeting.entityId, eventDate(meeting))}
    />
  );
}
