import type { MeetingNotification } from "@substrate/contracts/desktop/screen-notifications-ipc";

import { formatTimeRange, toDate, type DateInput } from "@/lib/format/date";

const minute = 60_000;

type Meeting = MeetingNotification["payload"];

export type MeetingTiming = {
  /** "started" once the start time has passed, even before main's next update says so. */
  phase: Meeting["phase"];
  /** "In 5 min", "Starting now", "Started 2 min ago", or "Ended". */
  relative: string;
  /** "10:00 AM – 10:30 AM". */
  range: string;
};

/** "5 min", "1 hr", "1 hr 15 min". */
function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

function relativeLabel(start: number, end: number, now: number) {
  if (end > start && now >= end) return "Ended";
  const until = start - now;
  // Round up before the start, so a card shown 59 seconds early says "In 1 min", never "In 0 min".
  if (until > 30_000) return `In ${minutesLabel(Math.ceil(until / minute))}`;
  if (until > 0) return "Starting now";
  const elapsed = Math.floor(-until / minute);
  return elapsed < 1 ? "Started just now" : `Started ${minutesLabel(elapsed)} ago`;
}

/** The card's time line for a meeting at a moment. */
export function meetingTiming(meeting: Meeting, now: DateInput = Date.now()): MeetingTiming {
  const at = toDate(now)?.getTime() ?? Date.now();
  const start = toDate(meeting.startsAt)?.getTime() ?? at;
  const end = toDate(meeting.endsAt)?.getTime() ?? start;
  return {
    phase: meeting.phase === "started" || at >= start ? "started" : "upcoming",
    relative: relativeLabel(start, end, at),
    range: formatTimeRange(meeting.startsAt, meeting.endsAt),
  };
}
