import { realtimeKeys } from "@substrate/contracts/realtime";

import {
  account,
  calendarEventAttendees,
  calendarEvents,
  calendars,
  entities,
  member,
  organizationApps,
} from "../../schema";
import {
  connectCalendar,
  leaseCalendar,
  linkCalendarAccount,
  providerAttendee,
  providerEvent,
  syncCalendarEvents,
} from "../../testing/calendar";
import { setupDatabase } from "../../testing/database";
import { receivesChange } from "../../testing/realtime";
import { rejection } from "../../testing/rejection";
import { claimCalendarSync, commitCalendarSync, failCalendarSync } from "./sync";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();

const connectAlice = () => connectCalendar(f.db, { userId: "alice", organizationId: f.orgA });

async function calendarRow(entityId: string) {
  const [row] = await f.db.select().from(calendars).where(eq(calendars.entityId, entityId));
  return row!;
}

async function eventRows(calendarEntityId: string) {
  return f.db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.calendarEntityId, calendarEntityId))
    .orderBy(calendarEvents.providerEventId);
}

test("a claim leases one due calendar until the lease expires", async () => {
  const { calendar } = await connectAlice();
  const now = new Date(Date.now() + 1000);
  const { result: claim } = await claimCalendarSync(f.db, { leaseMs: 60_000, now });
  expect(claim).toMatchObject({
    organizationId: f.orgA,
    calendarEntityId: calendar.entityId,
    ownerUserId: "alice",
    ownerActorEntityId: f.alice,
    provider: "google",
    providerCalendarId: "primary@example.com",
    syncCursor: null,
  });
  expect((await claimCalendarSync(f.db, { leaseMs: 60_000, now })).result).toBeNull();
  const later = new Date(now.getTime() + 60_001);
  const { result: reclaimed } = await claimCalendarSync(f.db, { leaseMs: 60_000, now: later });
  expect(reclaimed?.calendarEntityId).toBe(calendar.entityId);
  expect(reclaimed?.leaseToken).not.toBe(claim!.leaseToken);
});

test("a claim skips paused calendars, disabled apps, and owners who left", async () => {
  const { calendar } = await connectAlice();
  const now = new Date(Date.now() + 1000);
  const claim = () => claimCalendarSync(f.db, { leaseMs: 60_000, now });

  await f.db.update(calendars).set({ syncStatus: "paused", nextSyncAt: null });
  expect((await claim()).result).toBeNull();
  await f.db.update(calendars).set({ syncStatus: "pending", nextSyncAt: new Date() });

  await setCalendarApp(false);
  expect((await claim()).result).toBeNull();
  await setCalendarApp(true);
  expect((await claim()).result?.calendarEntityId).toBe(calendar.entityId);
  await f.db.update(calendars).set({ syncLeaseToken: null, syncLeaseExpiresAt: null });

  await f.db.delete(member).where(eq(member.id, "alice-a"));
  expect((await claim()).result).toBeNull();
  expect((await calendarRow(calendar.entityId)).syncLeaseToken).toBeNull();
});

function setCalendarApp(enabled: boolean) {
  return f.db
    .update(organizationApps)
    .set({ enabled })
    .where(
      and(eq(organizationApps.organizationId, f.orgA), eq(organizationApps.appId, "calendar")),
    );
}

test("a commit with a lost lease writes nothing", async () => {
  const { calendar } = await connectAlice();
  const claim = await leaseCalendar(f.db, calendar.entityId);
  const result = {
    fullSync: true,
    events: [providerEvent({ providerEventId: "a" })],
    cancelledEventIds: [],
    nextCursor: "next",
  };
  const wrongToken = await commitCalendarSync(f.db, {
    claim: { ...claim, leaseToken: crypto.randomUUID() },
    result,
  });
  expect(wrongToken.result.committed).toBe(false);
  expect(wrongToken.hints).toEqual([]);
  const expired = await commitCalendarSync(f.db, {
    claim,
    result,
    now: new Date(Date.now() + 120_000),
  });
  expect(expired.result.committed).toBe(false);
  expect(await eventRows(calendar.entityId)).toEqual([]);
  const row = await calendarRow(calendar.entityId);
  expect(row).toMatchObject({ syncCursor: null, syncStatus: "pending", syncGeneration: 0 });
  expect(row.syncLeaseToken).toBe(claim.leaseToken);
});

test("a commit stores events and the cursor, clears the lease, and hints only the owner", async () => {
  const { calendar } = await connectAlice();
  const claim = await leaseCalendar(f.db, calendar.entityId);
  const now = new Date();
  const committed = await commitCalendarSync(f.db, {
    claim,
    now,
    result: {
      fullSync: true,
      events: [
        providerEvent({
          providerEventId: "a",
          attendees: [
            providerAttendee(" Jane@Customer.COM ", { displayName: "Jane" }),
            providerAttendee("jane@customer.com", { displayName: "Duplicate" }),
            providerAttendee("alice@example.com", { isSelf: true }),
          ],
        }),
      ],
      cancelledEventIds: [],
      nextCursor: "next",
    },
  });
  expect(committed.result.committed).toBe(true);
  const row = await calendarRow(calendar.entityId);
  expect(row).toMatchObject({
    syncCursor: "next",
    syncStatus: "active",
    syncGeneration: 1,
    syncLeaseToken: null,
    syncLeaseExpiresAt: null,
    syncErrorCode: null,
  });
  expect(row.nextSyncAt!.getTime()).toBe(now.getTime() + 5 * 60_000);
  const [event] = await eventRows(calendar.entityId);
  const [entity] = await f.db.select().from(entities).where(eq(entities.entityId, event!.entityId));
  expect(entity).toMatchObject({ entityType: "calendar_event", accessEntityId: calendar.entityId });
  const attendees = await f.db
    .select()
    .from(calendarEventAttendees)
    .where(eq(calendarEventAttendees.eventEntityId, event!.entityId))
    .orderBy(calendarEventAttendees.normalizedEmail);
  expect(
    attendees.map(({ email, normalizedEmail, displayName }) => [
      email,
      normalizedEmail,
      displayName,
    ]),
  ).toEqual([
    ["alice@example.com", "alice@example.com", null],
    ["Jane@Customer.COM", "jane@customer.com", "Jane"],
  ]);

  const audience = realtimeKeys.entity(f.orgA, calendar.entityId);
  expect(committed.hints).toEqual([{ audience, domain: "context" }]);
  await f.verifyEmails();
  expect(await receivesChange(f.db, { userId: "alice", organizationId: f.orgA }, audience)).toBe(
    true,
  );
  expect(await receivesChange(f.db, { userId: "bob", organizationId: f.orgA }, audience)).toBe(
    false,
  );
});

test("a sync updates events in place, replaces attendees, and keeps a recorded meeting recorded", async () => {
  const { calendar } = await connectAlice();
  await syncCalendarEvents(f.db, calendar.entityId, [
    providerEvent({ providerEventId: "a", attendees: [providerAttendee("old@example.com")] }),
  ]);
  const [before] = await eventRows(calendar.entityId);
  const recordedAt = new Date("2026-02-01T00:00:00.000Z");
  await f.db
    .update(calendarEvents)
    .set({ interactionsRecordedAt: recordedAt })
    .where(eq(calendarEvents.entityId, before!.entityId));
  await syncCalendarEvents(f.db, calendar.entityId, [
    providerEvent({
      providerEventId: "a",
      title: "Renamed",
      attendees: [providerAttendee("new@example.com")],
    }),
  ]);
  const [after] = await eventRows(calendar.entityId);
  expect(after).toMatchObject({
    entityId: before!.entityId,
    title: "Renamed",
    interactionsRecordedAt: recordedAt,
  });
  const attendees = await f.db
    .select({ email: calendarEventAttendees.normalizedEmail })
    .from(calendarEventAttendees)
    .where(eq(calendarEventAttendees.eventEntityId, before!.entityId));
  expect(attendees).toEqual([{ email: "new@example.com" }]);
});

test("a full sync deletes events from older generations; an incremental sync keeps them", async () => {
  const { calendar } = await connectAlice();
  await syncCalendarEvents(f.db, calendar.entityId, [
    providerEvent({ providerEventId: "a" }),
    providerEvent({ providerEventId: "b" }),
  ]);
  await syncCalendarEvents(f.db, calendar.entityId, [providerEvent({ providerEventId: "c" })]);
  expect((await eventRows(calendar.entityId)).map((row) => row.providerEventId)).toEqual([
    "a",
    "b",
    "c",
  ]);
  const [stale] = await eventRows(calendar.entityId);
  await syncCalendarEvents(f.db, calendar.entityId, [providerEvent({ providerEventId: "b" })], {
    fullSync: true,
  });
  expect((await eventRows(calendar.entityId)).map((row) => row.providerEventId)).toEqual(["b"]);
  expect(await f.db.select().from(entities).where(eq(entities.entityId, stale!.entityId))).toEqual(
    [],
  );
});

test("cancelled event IDs mark existing events cancelled", async () => {
  const { calendar } = await connectAlice();
  await syncCalendarEvents(f.db, calendar.entityId, [
    providerEvent({ providerEventId: "a" }),
    providerEvent({ providerEventId: "b" }),
  ]);
  await syncCalendarEvents(f.db, calendar.entityId, [], { cancelledEventIds: ["a", "missing"] });
  expect(
    (await eventRows(calendar.entityId)).map((row) => [row.providerEventId, row.status]),
  ).toEqual([
    ["a", "cancelled"],
    ["b", "confirmed"],
  ]);
});

test("a failed sync records its outcome and releases the lease", async () => {
  const { calendar } = await connectAlice();
  const now = new Date();
  const fail = async (outcome: "retry" | "reauth_required" | "reset") => {
    await f.db.update(calendars).set({ syncCursor: "cursor", syncStatus: "active" });
    const claim = await leaseCalendar(f.db, calendar.entityId);
    const { result } = await failCalendarSync(f.db, { claim, outcome, errorCode: "http_500", now });
    expect(result.committed).toBe(true);
    return calendarRow(calendar.entityId);
  };

  const retry = await fail("retry");
  expect(retry).toMatchObject({
    syncStatus: "error",
    syncErrorCode: "http_500",
    syncCursor: "cursor",
  });
  expect(retry.nextSyncAt!.getTime()).toBe(now.getTime() + 15 * 60_000);
  expect(retry.syncLeaseToken).toBeNull();

  const reauth = await fail("reauth_required");
  expect(reauth).toMatchObject({
    syncStatus: "reauth_required",
    syncErrorCode: "http_500",
    nextSyncAt: null,
    syncLeaseToken: null,
  });

  const reset = await fail("reset");
  expect(reset).toMatchObject({ syncStatus: "pending", syncCursor: null, nextSyncAt: now });
  expect(reset.syncLeaseToken).toBeNull();

  const claim = await leaseCalendar(f.db, calendar.entityId);
  const lost = await failCalendarSync(f.db, {
    claim: { ...claim, leaseToken: crypto.randomUUID() },
    outcome: "retry",
    errorCode: "lost",
  });
  expect(lost.result.committed).toBe(false);
  expect((await calendarRow(calendar.entityId)).syncErrorCode).toBeNull();
});

test("unlinking the account of a connected calendar keeps it and its events, disconnected", async () => {
  const { calendar, credentialAccountId } = await connectAlice();
  await syncCalendarEvents(f.db, calendar.entityId, [providerEvent({ providerEventId: "a" })]);
  await f.db.delete(account).where(eq(account.id, credentialAccountId));

  // The stored status stays active; only the credential is gone.
  expect(await calendarRow(calendar.entityId)).toMatchObject({
    credentialAccountId: null,
    syncStatus: "active",
  });
  expect(await eventRows(calendar.entityId)).toHaveLength(1);
  const alice = await f.forSession("alice");
  const settings = await alice.calendar.settings();
  expect(settings.accounts).toEqual([]);
  expect(settings.detachedCalendars).toMatchObject([
    { entityId: calendar.entityId, credentialAccountId: null, syncStatus: "disconnected" },
  ]);
  const { result: claim } = await claimCalendarSync(f.db, {
    leaseMs: 60_000,
    now: new Date(Date.now() + 10 * 60_000),
  });
  expect(claim).toBeNull();

  // Connecting through a newly linked account re-attaches the calendar and restarts its sync.
  const relinked = await linkCalendarAccount(f.db, "alice");
  const {
    result: [reattached],
  } = await alice.calendar.connect({
    credentialAccountId: relinked,
    calendars: [
      {
        providerCalendarId: "primary@example.com",
        name: "Work",
        color: null,
        timeZone: "UTC",
        isPrimary: true,
      },
    ],
  });
  expect(reattached).toMatchObject({
    entityId: calendar.entityId,
    credentialAccountId: relinked,
    syncStatus: "pending",
  });
  expect((await calendarRow(calendar.entityId)).syncCursor).toBeNull();
});

test("an event cannot reference a calendar in another organization", async () => {
  const { calendar } = await connectAlice();
  const entityId = crypto.randomUUID();
  await f.db.insert(entities).values({
    entityId,
    organizationId: f.orgB,
    entityType: "calendar_event",
    accessEntityId: entityId,
  });
  const error = await rejection(
    f.db.insert(calendarEvents).values({
      entityId,
      organizationId: f.orgB,
      entityType: "calendar_event",
      calendarEntityId: calendar.entityId,
      providerEventId: "a",
      kind: "default",
      status: "confirmed",
      startsAt: new Date(),
      endsAt: new Date(),
      syncGeneration: 0,
    }),
  );
  expect(error).toMatchObject({ cause: { code: "23503" } });
  expect(
    await f.db.select().from(calendarEvents).where(eq(calendarEvents.organizationId, f.orgB)),
  ).toEqual([]);
});
