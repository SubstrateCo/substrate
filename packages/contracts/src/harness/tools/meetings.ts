import {
  archiveTimeZone,
  manualMeeting,
  meetingFilter,
  providerIds,
} from "../../meetings/model.ts";
import { id, page, pageInput, requestId } from "./shared.ts";
import { z } from "zod";

const summary = z.object({
  id,
  title: z.string(),
  localStart: z.string(),
  startMs: z.number().nullable(),
  durationMs: z.number().nullable(),
  platform: z.string().nullable(),
  notes: z.boolean(),
  transcript: z.boolean(),
  providers: z.array(z.enum(providerIds)),
});
export const meetingTools = {
  list_meetings: {
    title: "List meetings",
    description:
      "Search the owner's private Meetings archive by title, people, notes or transcript, or browse one day. Only available in your private conversation with your owner. Newest first.",
    readOnly: true,
    input: z.strictObject({ ...meetingFilter.shape, ...pageInput }),
    output: page(summary),
  },
  get_meeting: {
    title: "Get meeting",
    description:
      "Inspect one archived call, its participants and original sources before reading notes or a transcript.",
    readOnly: true,
    input: z.strictObject({ meetingId: id, timeZone: archiveTimeZone.optional() }),
    output: summary.extend({
      people: z.array(z.object({ name: z.string(), evidence: z.string() })),
      sources: z.array(
        z.object({
          id,
          provider: z.enum(providerIds),
          title: z.string(),
          credit: z.string().nullable(),
          hasNotes: z.boolean(),
          turnCount: z.int().nonnegative(),
        }),
      ),
      sourceMessage: z.object({ messageId: id, conversationId: id }).nullable(),
    }),
  },
  read_meeting_source: {
    title: "Read meeting source",
    description:
      "Read notes or a transcript turn verbatim from one original. Continue using nextOffset, then nextTurn. No guessed speaker or timestamp.",
    readOnly: true,
    input: z.strictObject({
      meetingId: id,
      sourceId: id,
      section: z.enum(["notes", "transcript"]),
      turn: z.int().min(0).max(150000).default(0),
      offset: z.int().min(0).max(4000000).default(0),
    }),
    output: z.object({
      text: z.string(),
      speaker: z.string().nullable(),
      offsetMs: z.number().nullable(),
      nextOffset: z.number().nullable(),
      nextTurn: z.number().nullable(),
    }),
  },
  create_meeting: {
    title: "Create meeting",
    description:
      "Add a manual record of a call to the owner's private archive. This does not schedule an event or invite people. Include the source message ID when recording a message from this conversation.",
    readOnly: false,
    idempotent: true,
    input: z.strictObject({ requestId, meeting: manualMeeting, sourceMessageId: id.optional() }),
    output: z.object({ id }),
  },
} as const;
