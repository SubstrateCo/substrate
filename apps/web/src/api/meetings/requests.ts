import type {
  CalendarInput,
  ManualMeeting,
  MeetingListInput,
  MeetingScope,
} from "@substrate/contracts/meetings";
import { hexFileLimit } from "@substrate/contracts/meetings/input";

import { api } from "../client";
import { readResult } from "../result";

const meetings = api.meetings;
const workspace = ({ userId, organizationId }: MeetingScope) => ({
  expectedUserId: userId,
  organizationId,
});

export const listMeetings = (scope: MeetingScope, query: MeetingListInput, signal: AbortSignal) =>
  readResult(meetings.list.$post({ json: { ...workspace(scope), query } }, { init: { signal } }));
export const meetingCalendar = (scope: MeetingScope, query: CalendarInput, signal: AbortSignal) =>
  readResult(
    meetings.calendar.$post({ json: { ...workspace(scope), query } }, { init: { signal } }),
  );
export const getMeeting = (
  scope: MeetingScope,
  id: string,
  timeZone: string,
  signal: AbortSignal,
) =>
  readResult(
    meetings.records[":id"].$get(
      { param: { id }, query: { ...workspace(scope), timeZone } },
      { init: { signal } },
    ),
  );
export const getOriginal = (scope: MeetingScope, id: string, signal: AbortSignal) =>
  readResult(
    meetings.originals[":id"].$get(
      { param: { id }, query: workspace(scope) },
      { init: { signal } },
    ),
  );
export const meetingSources = (scope: MeetingScope, signal: AbortSignal) =>
  readResult(meetings.sources.$get({ query: workspace(scope) }, { init: { signal } }));
export const matchReviews = (scope: MeetingScope, timeZone: string, signal: AbortSignal) =>
  readResult(
    meetings.reviews.$get({ query: { ...workspace(scope), timeZone } }, { init: { signal } }),
  );
export const createMeeting = (scope: MeetingScope, meeting: ManualMeeting, requestId: string) =>
  readResult(meetings.records.$post({ json: { ...workspace(scope), meeting, requestId } }));
export const decideMatch = (
  scope: MeetingScope,
  id: string,
  candidateId: string,
  combine: boolean,
) =>
  readResult(
    meetings.reviews[":id"].$post({
      param: { id },
      json: { ...workspace(scope), candidateId, combine },
    }),
  );
export async function importHex(scope: MeetingScope, file: File) {
  if (file.size > hexFileLimit || !/\.(md|markdown)$/i.test(file.name))
    throw new Error("Choose a Markdown file up to 16 MiB.");
  // Keep BOM and line endings intact for original inspection and content-addressed replay.
  const raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    await file.arrayBuffer(),
  );
  return readResult(meetings.import.$post({ query: workspace(scope), json: { raw } }));
}
