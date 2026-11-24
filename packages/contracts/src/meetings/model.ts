import { knownTimeZone } from "../timestamps.ts";
import type { userWorkspace } from "../workspace.ts";
import { z } from "zod";

// Historic originals keep their attribution even after a connector is removed.
export const providerIds = ["manual", "hex", "meet", "granola", "fathom"] as const;
export type MeetingProvider = (typeof providerIds)[number];
export const providerNames: Record<MeetingProvider, string> = {
  manual: "Manual entry",
  hex: "Hex",
  meet: "Google Meet",
  granola: "Granola",
  fathom: "Fathom",
};
export const meetingPerson = z.object({
  name: z.string().trim().min(1).max(500),
  key: z.string().min(1).max(700).nullable(),
  evidence: z.enum(["self", "attendance", "speaker", "invited", "unresolved"]),
});
export type MeetingPerson = z.output<typeof meetingPerson>;
export const meetingTurn = z.object({
  speaker: z.string().max(500),
  offsetMs: z.int().nonnegative().nullable(),
  text: z.string().max(200_000),
});
// Native timestamps retain their instant. A wall time from a file is not UTC.
export const originalInput = z.object({
  key: z.string().min(1).max(1500),
  nativeId: z.string().min(1).max(1500).nullable(),
  title: z.string().trim().min(1).max(1200),
  localStart: z.iso.datetime({ local: true }).refine((v) => !v.endsWith("Z")),
  startMs: z.int().nullable(),
  durationMs: z.int().nonnegative().nullable(),
  platform: z.string().max(240).nullable(),
  occurrence: z.string().max(1800).nullable(),
  people: z.array(meetingPerson).max(5000),
  notes: z.string().max(4_000_000).nullable(),
  credit: z.string().max(1200).nullable(),
  turns: z.array(meetingTurn).max(150_000),
  transcriptState: z.enum(["available", "pending", "missing"]),
  format: z.enum(["markdown", "json"]),
  raw: z.string().max(24_000_000),
});
export type SourceInput = z.output<typeof originalInput>;
export type MeetingRow = {
  id: string;
  title: string;
  localStart: string;
  startMs: number | null;
  durationMs: number | null;
  platform: string | null;
  people: MeetingPerson[];
  providers: MeetingProvider[];
  notes: boolean;
  transcript: boolean;
};
export type OriginalView = Omit<SourceInput, "key" | "raw"> & {
  id: string;
  provider: MeetingProvider;
};
export type MeetingDetail = {
  meeting: MeetingRow;
  originals: OriginalView[];
  sourceMessage: { conversationId: string; messageId: string } | null;
};
export type MatchReview = {
  originalId: string;
  provider: MeetingProvider;
  title: string;
  localStart: string;
  people: MeetingPerson[];
  candidate: MeetingRow;
};
export type ImportCounts = {
  added: number;
  linked: number;
  updated: number;
  unchanged: number;
  review: number;
};
export type MeetingDay = {
  day: string;
  count: number;
  previews: Pick<MeetingRow, "id" | "title" | "localStart">[];
};
export type CalendarData = {
  days: MeetingDay[];
  months: { month: string; count: number; people: number }[];
  count: number;
  people: number;
  durationMs: number;
  knownDurations: number;
  withTranscript: number;
};
export type MeetingScope = z.output<typeof userWorkspace>;
export const archiveTimeZone = z
  .string()
  .max(100)
  .regex(/^[A-Za-z]/)
  .refine(knownTimeZone);
export const meetingFilter = z.object({
  timeZone: archiveTimeZone.optional(),
  source: z.enum(providerIds).optional(),
  q: z.string().trim().max(256).optional(),
  day: z.iso.date().optional(),
});
export const listInput = meetingFilter.extend({
  sort: z.enum(["title", "date", "time", "duration"]).default("date"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  offset: z.int().min(0).max(10_000_000).default(0),
});
export type MeetingListInput = z.output<typeof listInput>;
export const pageSize = 50;
export const calendarInput = meetingFilter.omit({ day: true }).extend({
  period: z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/),
});
export type CalendarInput = z.output<typeof calendarInput>;
export const manualMeeting = z.strictObject({
  title: originalInput.shape.title,
  startsAt: z.iso
    .datetime({ offset: true, local: true })
    .describe("ISO date and time. Include the known offset; omit it for an unspecified time zone."),
  durationMs: z.int().nonnegative().optional(),
  platform: z.string().trim().min(1).max(240).optional(),
  people: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
  notes: z.string().min(1).max(100_000).optional(),
  transcript: z.string().min(1).max(100_000).optional(),
});
export type ManualMeeting = z.output<typeof manualMeeting>;
