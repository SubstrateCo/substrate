import type { SourceInput } from "@substrate/contracts/meetings";

import { organizationApps } from "../../core/apps/schema";
import { setupDatabase } from "../../testing/database";
import { meetingArchives, meetingOriginals } from "./schema";
import { beforeEach, expect, test } from "bun:test";
import { eq, count } from "drizzle-orm";
import { rejects } from "node:assert/strict";

const f = setupDatabase(),
  q = { sort: "date", dir: "desc", offset: 0 } as const;
beforeEach(async () => {
  await f.verifyEmails();
  await f.db.insert(organizationApps).values(
    [f.orgA, f.orgB].map((organizationId) => ({
      organizationId,
      appId: "meetings" as const,
      enabled: true,
    })),
  );
});
const record: SourceInput = {
  key: "first",
  nativeId: null,
  title: "Shift handoff",
  localStart: "2026-11-18T09:12:00",
  startMs: null,
  durationMs: 377000,
  platform: "Slack Huddle",
  occurrence: null,
  people: [],
  notes: "A checklist.",
  credit: "Example model.",
  turns: [{ speaker: "Them", offsetMs: 6000, text: "Violet latch." }],
  transcriptState: "available",
  format: "markdown",
  raw: "Original\r\n",
};
test("a member’s private archive, originals and search results stay hidden from admins and other workspaces", async () => {
  const bob = (await f.forSession("bob")).meetings,
    alice = (await f.forSession("alice")).meetings;
  expect((await bob.list(q)).total).toBe(0);
  expect(await f.db.select({ n: count() }).from(meetingArchives)).toEqual([{ n: 0 }]);
  await bob.importHex(record);
  const call = (await bob.list(q)).rows[0]!,
    original = (await bob.detail(call.id))!.originals[0]!.id;
  expect(await bob.original(original)).toBe(record.raw);
  for (const other of [alice, (await f.forSession("outsider", f.orgB)).meetings]) {
    expect(await other.detail(call.id)).toBeNull();
    expect(await other.original(original)).toBeNull();
    expect(await other.sources()).toEqual([]);
    expect(await other.reviews()).toEqual([]);
    expect((await other.calendar({ period: "2026-11" })).count).toBe(0);
    expect((await other.list({ ...q, q: "latch" })).total).toBe(0);
  }
  await rejects(f.accessLevel(f.alice, call.id));
  const { result: other } = await alice.create(
    { title: "Other owner's call", startsAt: record.localStart },
    crypto.randomUUID(),
  );
  await rejects(
    f.db
      .update(meetingOriginals)
      .set({ meetingId: other.id })
      .where(eq(meetingOriginals.id, original)),
  );
});
test("concurrent Markdown imports and match decisions preserve originals and replay safely", async () => {
  const db = (await f.forSession("bob")).meetings;
  const both = await Promise.all([db.importHex(record), db.importHex(record)]);
  expect(both.map((r) => r.result.added).sort((a, b) => a - b)).toEqual([0, 1]);
  expect(await f.db.select({ n: count() }).from(meetingArchives)).toEqual([{ n: 1 }]);
  const m = (await db.list(q)).rows[0]!;
  const second = { ...record, key: "second", raw: "Second original" };
  expect((await db.importHex(second)).result.review).toBe(1);
  expect((await db.importHex(second)).result.unchanged).toBe(1);
  const pending = (await db.reviews())[0]!;
  const decisions = await Promise.allSettled([
    db.decide(pending.originalId, m.id, false),
    db.decide(pending.originalId, m.id, true),
  ]);
  expect(decisions.filter((d) => d.status === "fulfilled")).toHaveLength(1);
  expect(await db.reviews()).toEqual([]);
  expect(await db.original(pending.originalId)).toBe(second.raw);
});
test("manual retries create one call, distinct additions stay separate and missing metadata stays unknown", async () => {
  const db = (await f.forSession("bob")).meetings,
    requestId = crypto.randomUUID();
  const meeting = {
    title: "Evening shift",
    startsAt: "2026-11-30T17:30:00-08:00",
    transcript: "One voice.\nAnother voice.",
    people: ["Lee"],
  };
  const a = await Promise.all([db.create(meeting, requestId), db.create(meeting, requestId)]);
  expect(a[0].result).toEqual(a[1].result);
  await rejects(db.create({ ...meeting, title: "Different" }, requestId));
  await db.create({ ...meeting, startsAt: "2026-12-01T01:30:00" }, crypto.randomUUID());
  const { rows, total } = await db.list({ ...q, q: "Another voice" });
  expect(total).toBe(2);
  expect(rows.every((r) => r.durationMs === null && r.providers.join() === "manual")).toBe(true);
  expect(await db.reviews()).toEqual([]);
  const known = await db.detail(a[0].result.id, "UTC");
  expect(known?.originals[0]).toMatchObject({
    localStart: "2026-11-30T17:30:00",
    turns: [{ speaker: "", offsetMs: null, text: meeting.transcript }],
  });
  expect(known?.meeting.localStart).toBe("2026-12-01T01:30:00");
  expect((await db.calendar({ period: "2026-12", timeZone: "UTC" })).count).toBe(2);
  expect((await db.calendar({ period: "2026-12", timeZone: "America/Los_Angeles" })).count).toBe(1);
  expect((await db.calendar({ period: "2026-11", timeZone: "America/Los_Angeles" })).count).toBe(1);
});
