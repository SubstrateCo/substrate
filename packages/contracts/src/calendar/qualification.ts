import {
  type AttendeeResponseStatus,
  type CalendarEventKind,
  type CalendarEventStatus,
  type CalendarEventVisibility,
} from "./providers.ts";
import { maxMeetingPeople } from "./sync.ts";
import { type MeetingSkipReason } from "./views.ts";

export interface QualificationInput {
  calendar: { recordsInteractions: boolean; interactionsFrom: Date };
  event: {
    kind: CalendarEventKind;
    status: CalendarEventStatus;
    allDay: boolean;
    visibility: CalendarEventVisibility;
    endsAt: Date;
  };
  attendees: { responseStatus: AttendeeResponseStatus; isSelf: boolean; isResource: boolean }[];
  now: Date;
}

export type Qualification =
  | { state: "upcoming" }
  | { state: "eligible" }
  | { state: "skipped"; reason: MeetingSkipReason };

/** The number of people in a meeting: attendees who are not rooms, plus the owner if unlisted. */
export function meetingPeopleCount(attendees: QualificationInput["attendees"]) {
  const people = attendees.filter((attendee) => !attendee.isResource);
  return people.length + (people.some((attendee) => attendee.isSelf) ? 0 : 1);
}

/**
 * Whether a meeting may create contacts and interactions. This covers the event and the calendar;
 * the caller still skips attendees who are the owner, rooms, decliners, or organization members.
 */
export function qualifyMeeting({
  calendar,
  event,
  attendees,
  now,
}: QualificationInput): Qualification {
  const skip = (reason: MeetingSkipReason) => ({ state: "skipped", reason }) as const;
  if (event.status === "cancelled") return skip("cancelled");
  if (event.kind !== "default") return skip("not_a_meeting");
  if (event.allDay) return skip("all_day");
  if (event.visibility === "private" || event.visibility === "confidential") return skip("private");
  if (attendees.some((attendee) => attendee.isSelf && attendee.responseStatus === "declined"))
    return skip("owner_declined");
  const people = meetingPeopleCount(attendees);
  if (people < 2) return skip("no_other_people");
  if (people > maxMeetingPeople) return skip("too_many_people");
  if (!calendar.recordsInteractions) return skip("interactions_off");
  if (event.endsAt < calendar.interactionsFrom) return skip("before_interactions_from");
  if (event.endsAt > now) return { state: "upcoming" };
  return { state: "eligible" };
}
