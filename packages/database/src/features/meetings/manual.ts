import type { ManualMeeting, SourceInput } from "@substrate/contracts/meetings";

/** A pasted transcript is verbatim. Never invent speaker labels, offsets, or a time zone. */
export function manualOriginal(meeting: ManualMeeting, key: string): SourceInput {
  const { startsAt, title, durationMs, platform, people, notes, transcript } = meeting;
  const zone = /(?:Z|[+-]\d{2}:\d{2})$/;
  const wall = startsAt.replace(zone, "");
  return {
    key,
    nativeId: null,
    title,
    localStart: wall.length === 16 ? `${wall}:00` : wall,
    startMs: zone.test(startsAt) ? Date.parse(startsAt) : null,
    durationMs: durationMs ?? null,
    platform: platform ?? null,
    occurrence: null,
    people: (people ?? []).map((name) => ({ name, key: null, evidence: "attendance" })),
    notes: notes ?? null,
    credit: null,
    turns: transcript ? [{ speaker: "", offsetMs: null, text: transcript }] : [],
    transcriptState: transcript ? "available" : "missing",
    format: "json",
    raw: JSON.stringify(meeting, null, 2),
  };
}
