import { useQuery } from "@tanstack/react-query";

import { MeetingList } from "./meeting-list";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useNow } from "@/hooks/use-now";
import { eventDate } from "@/lib/calendar/days";
import { calendarLink } from "@/lib/navigation/record-links";
import { contactMeetingsOptions } from "@/queries/calendar/options";

export function ContactMeetings({ contactEntityId }: { contactEntityId: string }) {
  const apps = useOrganizationApps();
  if (!apps.enabled("calendar")) return null;
  return <ContactMeetingList contactEntityId={contactEntityId} />;
}

function ContactMeetingList({ contactEntityId }: { contactEntityId: string }) {
  const { organizationId } = useWorkspaceScope();
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
