import {
  pageSize,
  type CalendarData,
  type CalendarInput,
  type MatchReview,
  type MeetingDay,
  type MeetingListInput,
  type MeetingRow,
  type OriginalView,
} from "@substrate/contracts/meetings";

import { requireAppEnabled } from "../../core/apps/access";
import type { RepositoryContext } from "../../core/repository-context";
import { ownedArchives } from "./archive";
import { meetingOriginals, meetings } from "./schema";
import { sourceMessageOf } from "./source-message";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  count,
  gte,
  inArray,
  isNotNull,
  lt,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";

// Known instants follow the viewing device, including across midnight and DST.
// A Markdown export's floating wall time never acquires an invented offset.
function archiveClock(
  zone?: string,
  local: SQLWrapper = meetings.localStart,
  instant: SQLWrapper = meetings.startMs,
) {
  return zone
    ? sql<string>`coalesce(to_char(to_timestamp(${instant} / 1000.0) at time zone ${zone}, 'YYYY-MM-DD"T"HH24:MI:SS'), ${local})`
    : sql<string>`${local}`;
}
export const displayedMeeting = (zone?: string) => ({
  ...getTableColumns(meetings),
  localStart: archiveClock(zone),
});
function conditions(
  ctx: RepositoryContext,
  filter: Pick<MeetingListInput, "source" | "q" | "day" | "timeZone">,
) {
  const predicates: SQL[] = [
    inArray(meetings.archiveId, ownedArchives(ctx)),
    ctx.readable(meetings.id),
  ];
  if (filter.day)
    predicates.push(
      gte(archiveClock(filter.timeZone), filter.day),
      lt(archiveClock(filter.timeZone), filter.day + "~"),
    );
  if (filter.source)
    predicates.push(
      sql`exists(select 1 from ${meetingOriginals} where ${meetingOriginals.org}=${meetings.org} and ${meetingOriginals.meetingId}=${meetings.id} and ${meetingOriginals.provider}=${filter.source})`,
    );
  if (filter.q)
    predicates.push(
      sql`exists(select 1 from ${meetingOriginals} where ${meetingOriginals.meetingId}=${meetings.id} and strpos(${meetingOriginals.searchText},${filter.q.toLowerCase()})>0)`,
    );
  return predicates;
}
function row({
  id,
  title,
  localStart,
  startMs,
  durationMs,
  platform,
  people,
  providers,
  notes,
  transcript,
}: typeof meetings.$inferSelect): MeetingRow {
  return {
    id,
    title,
    localStart,
    startMs,
    durationMs,
    platform,
    people,
    providers,
    notes,
    transcript,
  };
}
export function meetingReads(ctx: RepositoryContext) {
  const tx = ctx.db;
  return {
    list: async (q: MeetingListInput, take = pageSize) => {
      await requireAppEnabled(ctx, "meetings");
      const where = and(...conditions(ctx, q));
      const fields = displayedMeeting(q.timeZone);
      const column = {
        date: fields.localStart,
        time: sql`substr(${fields.localStart},12)`,
        title: sql`lower(${meetings.title})`,
        duration: meetings.durationMs,
      }[q.sort];
      const order = q.dir === "asc" ? asc : desc;
      const ties =
        q.sort === "date" ? [order(meetings.id)] : [desc(fields.localStart), asc(meetings.id)];
      const total = await tx.$count(meetings, where);
      const found = await tx
        .select(fields)
        .from(meetings)
        .where(where)
        .orderBy(sql`${order(column)} nulls last`, ...ties)
        .limit(take)
        .offset(q.offset);
      return { rows: found.map(row), total };
    },
    detail: async (id: string, zone?: string) => {
      await requireAppEnabled(ctx, "meetings");
      const [m] = await tx
        .select(displayedMeeting(zone))
        .from(meetings)
        .where(and(...conditions(ctx, {}), eq(meetings.id, id)));
      if (!m) return null;
      const src = await tx
        .select({
          id: meetingOriginals.id,
          provider: meetingOriginals.provider,
          meta: meetingOriginals.meta,
          notes: meetingOriginals.notes,
          turns: meetingOriginals.turns,
        })
        .from(meetingOriginals)
        .where(and(eq(meetingOriginals.archiveId, m.archiveId), eq(meetingOriginals.meetingId, id)))
        .orderBy(asc(meetingOriginals.id));
      return {
        meeting: row(m),
        sourceMessage: await sourceMessageOf(ctx, id),
        originals: src.map(({ meta, ...fields }): OriginalView => ({
          nativeId: meta.nativeId,
          title: meta.title,
          localStart: meta.localStart,
          startMs: meta.startMs,
          durationMs: meta.durationMs,
          platform: meta.platform,
          occurrence: meta.occurrence,
          people: meta.people,
          credit: meta.credit,
          transcriptState: meta.transcriptState,
          format: meta.format,
          ...fields,
        })),
      };
    },
    original: async (id: string) => {
      await requireAppEnabled(ctx, "meetings");
      const originals = await tx
        .select({ raw: meetingOriginals.raw })
        .from(meetingOriginals)
        .where(
          and(
            inArray(meetingOriginals.archiveId, ownedArchives(ctx)),
            eq(meetingOriginals.id, id),
            ctx.readable(
              sql`coalesce(${meetingOriginals.meetingId},${meetingOriginals.candidateId})`,
            ),
          ),
        );
      return originals.at(0)?.raw ?? null;
    },
    reviews: async (zone?: string) => {
      await requireAppEnabled(ctx, "meetings");
      const items = await tx
        .select({
          id: meetingOriginals.id,
          provider: meetingOriginals.provider,
          meta: meetingOriginals.meta,
          incomingClock: archiveClock(
            zone,
            sql`${meetingOriginals.meta}->>'localStart'`,
            sql`(${meetingOriginals.meta}->>'startMs')::bigint`,
          ),
          candidate: displayedMeeting(zone),
        })
        .from(meetingOriginals)
        .innerJoin(
          meetings,
          and(
            eq(meetings.id, meetingOriginals.candidateId),
            eq(meetings.org, meetingOriginals.org),
          ),
        )
        .where(and(...conditions(ctx, {}), isNotNull(meetingOriginals.candidateId)))
        .orderBy(asc(meetingOriginals.id))
        .limit(100);
      return items.map(({ id, provider, meta, incomingClock, candidate }): MatchReview => ({
        originalId: id,
        provider,
        title: meta.title,
        localStart: incomingClock,
        people: meta.people,
        candidate: row(candidate),
      }));
    },
    async sources() {
      await requireAppEnabled(ctx, "meetings");
      return tx
        .select({
          provider: meetingOriginals.provider,
          linked: count(meetingOriginals.meetingId),
          pendingReview: count(meetingOriginals.candidateId),
        })
        .from(meetingOriginals)
        .where(inArray(meetingOriginals.archiveId, ownedArchives(ctx)))
        .groupBy(meetingOriginals.provider)
        .orderBy(asc(meetingOriginals.provider));
    },
    calendar: async (q: CalendarInput) => {
      await requireAppEnabled(ctx, "meetings");
      const clock = archiveClock(q.timeZone);
      const items = await tx
        .select({
          id: meetings.id,
          title: meetings.title,
          localStart: clock,
          people: meetings.people,
          duration: meetings.durationMs,
          transcript: meetings.transcript,
        })
        .from(meetings)
        .where(and(...conditions(ctx, q), gte(clock, q.period), lt(clock, q.period + "~")))
        .orderBy(asc(clock), asc(meetings.id));
      const days = new Map<string, MeetingDay>(),
        months = new Map<string, { count: number; people: Set<string> }>(),
        people = new Set<string>();
      let durationMs = 0,
        knownDurations = 0,
        withTranscript = 0;
      for (const m of items) {
        const day = m.localStart.slice(0, 10),
          month = day.slice(0, 7);
        const d = days.get(day) ?? { day, count: 0, previews: [] };
        d.count++;
        if (q.period.length === 7 && d.previews.length < 6)
          d.previews.push({ id: m.id, title: m.title, localStart: m.localStart });
        days.set(day, d);
        const block = months.get(month) ?? { count: 0, people: new Set<string>() };
        block.count++;
        for (const p of m.people)
          if (p.key && (p.evidence === "attendance" || p.evidence === "speaker")) {
            people.add(p.key);
            block.people.add(p.key);
          }
        months.set(month, block);
        if (m.duration !== null) {
          durationMs += m.duration;
          knownDurations++;
        }
        if (m.transcript) withTranscript++;
      }
      return {
        days: [...days.values()],
        months: [...months].map(([month, v]) => ({
          month,
          count: v.count,
          people: v.people.size,
        })),
        count: items.length,
        people: people.size,
        durationMs,
        knownDurations,
        withTranscript,
      } satisfies CalendarData;
    },
  };
}
