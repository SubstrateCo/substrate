import type { MeetingNotification } from "@substrate/contracts/desktop/screen-notifications-ipc";

import { formatTimeRange, toDate, type DateInput } from "@/lib/format/date";

const minute = 60_000;
const startingNowWindow = 30_000;

type Meeting = MeetingNotification["payload"];

export type MeetingTiming = {
  phase: Meeting["phase"];
  relative: string;
  range: string;
};

function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

function relativeLabel(start: number, end: number, now: number) {
  if (end > start && now >= end) return "Ended";
  const until = start - now;
  const minutesUntilRoundedUp = Math.ceil(until / minute);
  if (until > startingNowWindow) return `In ${minutesLabel(minutesUntilRoundedUp)}`;
  if (until > 0) return "Starting now";
  const elapsed = Math.floor(-until / minute);
  return elapsed < 1 ? "Started just now" : `Started ${minutesLabel(elapsed)} ago`;
}

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
