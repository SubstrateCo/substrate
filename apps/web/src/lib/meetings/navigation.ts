import { providerIds } from "@substrate/contracts/meetings";

import { z } from "zod";
export const meetingSearch = z.object({
  section: z.enum(["all", "calendar", "review"]).optional().catch(undefined),
  source: z.enum(providerIds).optional(),
  day: z.iso.date().optional(),
  scale: z.enum(["year", "month", "stats"]).optional(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  sort: z.enum(["date", "title", "time", "duration"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  offset: z.coerce.number().int().min(0).max(10_000_000).optional(),
  meetingId: z.uuid().optional(),
  readerTab: z.enum(["notes", "transcript", "sources"]).optional(),
  originalId: z.uuid().optional(),
  turn: z.coerce.number().int().min(0).optional(),
});
export type MeetingSearch = z.output<typeof meetingSearch>;
export type ChangeMeetingView = (patch: Partial<MeetingSearch>, replace?: boolean) => void;
export const closedReader = {
  meetingId: undefined,
  readerTab: undefined,
  originalId: undefined,
  turn: undefined,
};
/** The reader view that shows one attached source on the Sources tab. */
export function sourceView(originalId: string): Partial<MeetingSearch> {
  return { readerTab: "sources", originalId, turn: undefined };
}
