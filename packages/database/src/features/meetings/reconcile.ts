import {
  originalInput,
  providerNames,
  type ImportCounts,
  type MeetingPerson,
  type MeetingProvider,
  type SourceInput,
} from "@substrate/contracts/meetings";

import type { DatabaseExecutor } from "../../core/executor";
import { ConflictError } from "../../errors";
import type { WritableArchive } from "./archive";
import { meetingOriginals, meetings } from "./schema";
import { and, asc, between, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

type Outcome = keyof ImportCounts;
export const zeroCounts = (): ImportCounts => ({
  added: 0,
  linked: 0,
  updated: 0,
  unchanged: 0,
  review: 0,
});
async function createMeeting(
  a: WritableArchive,
  meta: Omit<SourceInput, "notes" | "raw" | "turns">,
) {
  const { entityId: id } = await a.ctx.createChildEntity("meeting", a.access);
  await a.ctx.db.insert(meetings).values({
    id,
    org: a.org,
    archiveId: a.id,
    type: "meeting",
    title: meta.title,
    localStart: meta.localStart,
    startMs: meta.startMs,
    durationMs: meta.durationMs,
    platform: meta.platform,
    people: [],
    providers: [],
    notes: false,
    transcript: false,
  });
  return id;
}
async function refresh(tx: DatabaseExecutor, archiveId: string, id: string) {
  const attached = await tx
    .select({
      meta: meetingOriginals.meta,
      provider: meetingOriginals.provider,
      notes: sql<boolean>`${meetingOriginals.notes} is not null`,
      transcript: meetingOriginals.hasTranscript,
    })
    .from(meetingOriginals)
    .where(and(eq(meetingOriginals.archiveId, archiveId), eq(meetingOriginals.meetingId, id)))
    .orderBy(asc(meetingOriginals.id));
  // A conference clock takes precedence over recorder and notes timestamps, independent of import order.
  const rank: Record<MeetingProvider, number> = {
    manual: 0,
    meet: 1,
    hex: 2,
    fathom: 3,
    granola: 4,
  };
  attached.sort(
    (a, b) => rank[a.provider] - rank[b.provider] || a.meta.key.localeCompare(b.meta.key),
  );
  const first = attached.at(0);
  if (!first) throw new Error("Meeting has no original.");
  const clock = attached.find((r) => r.meta.startMs !== null) ?? first;
  // Meet's API has attendance and a conference clock, but supplies no authored title.
  const titled = attached.find((r) => r.provider !== "meet" && r.meta.title !== "Untitled meeting");
  const people = new Map<string, MeetingPerson>();
  const strength: Record<MeetingPerson["evidence"], number> = {
    self: 5,
    attendance: 4,
    speaker: 3,
    invited: 2,
    unresolved: 1,
  };
  for (const { meta } of attached)
    for (const p of meta.people) {
      const k = p.key ?? `${p.evidence}:${p.name}`;
      const prior = people.get(k);
      if (!prior || strength[p.evidence] > strength[prior.evidence]) people.set(k, p);
    }
  await tx
    .update(meetings)
    .set({
      title: titled?.meta.title ?? first.meta.title,
      localStart: clock.meta.localStart,
      startMs: clock.meta.startMs,
      durationMs: attached.find((x) => x.meta.durationMs !== null)?.meta.durationMs ?? null,
      platform: attached.find((x) => x.meta.platform)?.meta.platform ?? null,
      people: [...people.values()],
      providers: [...new Set(attached.map((x) => x.provider))],
      notes: attached.some((x) => x.notes),
      transcript: attached.some((x) => x.transcript),
    })
    .where(and(eq(meetings.archiveId, archiveId), eq(meetings.id, id)));
}
async function possibleMatch(a: WritableArchive, provider: MeetingProvider, v: SourceInput) {
  // Compare wall clocks as numbers when a source has no offset. Never store the temporary UTC assumption.
  const wall = (s: string) => Date.parse(s + "Z");
  const near = 10 * 60_000,
    start = wall(v.localStart);
  const lower = new Date(start - near).toISOString().slice(0, 19),
    upper = new Date(start + near + 1000).toISOString().slice(0, 19);
  const tx = a.ctx.db;
  const workspace = and(eq(meetings.archiveId, a.id), a.ctx.readable(meetings.id));
  const localMatches = tx
    .select()
    .from(meetings)
    .where(
      and(
        workspace,
        gte(meetings.localStart, lower),
        lt(meetings.localStart, upper),
        v.startMs === null ? undefined : isNull(meetings.startMs),
      ),
    );
  // An import after a time-zone change still finds a known instant. Each range has its own index.
  const candidates =
    v.startMs === null
      ? await localMatches
      : await localMatches.unionAll(
          tx
            .select()
            .from(meetings)
            .where(and(workspace, between(meetings.startMs, v.startMs - near, v.startMs + near))),
        );
  const keys = new Set(v.people.filter((p) => p.evidence !== "self" && p.key).map((p) => p.key));
  const time = (m: typeof meetings.$inferSelect) =>
    Math.abs(
      m.startMs !== null && v.startMs !== null
        ? m.startMs - v.startMs
        : wall(m.localStart) - wall(v.localStart),
    );
  return (
    candidates
      .filter((m) => {
        const delta = time(m);
        if (delta > near) return false;
        if (m.title.toLowerCase() === v.title.toLowerCase()) return true;
        if (m.people.some((p) => p.evidence !== "self" && p.key && keys.has(p.key))) return true;
        const possibleFileEdit =
          !v.nativeId && v.durationMs !== null && v.durationMs === m.durationMs;
        return delta <= 2 * 60_000 && (possibleFileEdit || !m.providers.includes(provider));
      })
      .sort((a, b) => time(a) - time(b) || a.id.localeCompare(b.id))[0]?.id ?? null
  );
}
export async function receive(
  a: WritableArchive,
  connectionId: string,
  provider: MeetingProvider,
  input: SourceInput,
) {
  const v = originalInput.parse(input);
  const tx = a.ctx.db;
  const key = and(
    eq(meetingOriginals.archiveId, a.id),
    eq(meetingOriginals.connectionId, connectionId),
    eq(meetingOriginals.sourceKey, v.key),
  );
  const [old] = await tx
    .select({
      meeting: meetingOriginals.meetingId,
      digest: meetingOriginals.digest,
    })
    .from(meetingOriginals)
    .where(key);
  const digest = createHash("sha256").update(JSON.stringify(v)).digest("hex");
  // An attached original keeps its meeting, including a user's "keep separate" decision.
  // For a pending original the counterpart, not just the replay, can gain an occurrence ID.
  const exact =
    !old?.meeting && v.occurrence
      ? await tx
          .selectDistinct({ id: meetingOriginals.meetingId })
          .from(meetingOriginals)
          .where(
            and(
              eq(meetingOriginals.archiveId, a.id),
              eq(meetingOriginals.occurrence, v.occurrence),
              isNotNull(meetingOriginals.meetingId),
              a.ctx.readable(meetingOriginals.meetingId),
            ),
          )
          .orderBy(asc(meetingOriginals.meetingId))
          .limit(2)
      : [];
  let meetingId = exact.length === 1 ? exact[0]!.id : null;
  if (old?.digest === digest && !meetingId)
    return { outcome: "unchanged" as const, meetingId: old.meeting };
  const { notes, raw, turns, ...meta } = v;
  const searchText = [
    v.title,
    v.platform,
    providerNames[provider],
    ...v.people.map((p) => p.name),
    notes,
    ...turns.map((t) => `${t.speaker} ${t.text}`),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  const values = {
    notes,
    raw,
    turns,
    meta,
    digest,
    hasTranscript: turns.length > 0,
    occurrence: v.occurrence,
    searchText,
  };
  if (old?.meeting) {
    await tx.update(meetingOriginals).set(values).where(key);
    await refresh(tx, a.id, old.meeting);
    return { outcome: "updated" as const, meetingId: old.meeting };
  }
  // Explicit manual creation is a new call, even if a different call has the same title and time.
  const candidateId =
    meetingId || provider === "manual"
      ? null
      : (exact[0]?.id ?? (await possibleMatch(a, provider, v)));
  let outcome: Outcome = "added";
  if (meetingId) outcome = "linked";
  else if (candidateId) outcome = "review";
  if (!meetingId && !candidateId) meetingId = await createMeeting(a, meta);
  if (old)
    await tx
      .update(meetingOriginals)
      .set({ ...values, meetingId, candidateId })
      .where(key);
  else
    await tx.insert(meetingOriginals).values({
      ...values,
      org: a.org,
      archiveId: a.id,
      connectionId,
      sourceKey: v.key,
      provider,
      meetingId,
      candidateId,
    });
  if (meetingId) await refresh(tx, a.id, meetingId);
  return { outcome, meetingId };
}
export async function decide(
  a: WritableArchive,
  id: string,
  candidateId: string,
  combine: boolean,
) {
  const tx = a.ctx.db;
  const where = and(
    eq(meetingOriginals.archiveId, a.id),
    eq(meetingOriginals.id, id),
    eq(meetingOriginals.candidateId, candidateId),
  );
  const [original] = await tx
    .select({ meta: meetingOriginals.meta })
    .from(meetingOriginals)
    .where(where);
  if (!original) throw new ConflictError("This match is no longer available.");
  await a.ctx.requireAccess(candidateId, "edit");
  const meetingId = combine ? candidateId : await createMeeting(a, original.meta);
  await tx.update(meetingOriginals).set({ meetingId, candidateId: null }).where(where);
  await refresh(tx, a.id, meetingId);
}
