import { contactInteractionRepository } from "../../core/contacts/interactions/interactions.repository";
import { relatedPair } from "../../core/links/repository";
import { RepositoryContext } from "../../core/repository-context";
import {
  calendarEvents,
  calendars,
  contactIdentifiers,
  entityLinks,
  organizationApps,
} from "../../schema";
import {
  connectCalendar,
  enableCalendarApp,
  linkCalendarAccount,
  providerAttendee,
  providerEvent,
  syncCalendarEvents,
} from "../../testing/calendar";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const dayMs = 86_400_000;

const session = (userId: string, organizationId = f.orgA) => f.forSession(userId, organizationId);
const range = { from: "2026-01-01T00:00:00.000Z", until: "2026-02-01T00:00:00.000Z" };

async function connectAlice(options: Parameters<typeof connectCalendar>[1]["calendar"] = {}) {
  return connectCalendar(f.db, { userId: "alice", organizationId: f.orgA, calendar: options });
}

async function eventId(providerEventId: string) {
  const [row] = await f.db
    .select({ entityId: calendarEvents.entityId })
    .from(calendarEvents)
    .where(eq(calendarEvents.providerEventId, providerEventId));
  return row!.entityId;
}

async function contactWithEmail(name: string, email: string) {
  const contact = await f.forActor(f.alice).contacts.createContact({ displayName: name });
  await f.db.insert(contactIdentifiers).values({
    organizationId: f.orgA,
    contactEntityId: contact.entityId,
    type: "email",
    value: email,
    normalizedValue: email,
  });
  return contact;
}

test("connect requires the session user's own linked account", async () => {
  await f.verifyEmails();
  await enableCalendarApp(f.db, f.orgA);
  const bobAccount = await linkCalendarAccount(f.db, "bob");
  const calendar = {
    providerCalendarId: "primary",
    name: "Work",
    color: null,
    timeZone: null,
    isPrimary: true,
  };
  const alice = await session("alice");
  for (const credentialAccountId of [bobAccount, "missing"])
    expect(
      await rejection(alice.calendar.connect({ credentialAccountId, calendars: [calendar] })),
    ).toMatchObject({ name: "AccessDeniedError" });
  expect(await f.db.select().from(calendars)).toEqual([]);
});

test("connect needs the calendar app", async () => {
  await f.verifyEmails();
  const credentialAccountId = await linkCalendarAccount(f.db, "alice");
  const alice = await session("alice");
  const error = await rejection(
    alice.calendar.connect({
      credentialAccountId,
      calendars: [
        {
          providerCalendarId: "primary",
          name: "Work",
          color: null,
          timeZone: null,
          isPrimary: true,
        },
      ],
    }),
  );
  expect(error).toMatchObject({ name: "AppDisabledError" });
});

test("a new calendar starts pending, recording interactions, from now", async () => {
  const before = Date.now();
  const { calendar } = await connectAlice();
  expect(calendar).toMatchObject({
    provider: "google",
    providerCalendarId: "primary@example.com",
    recordsInteractions: true,
    syncStatus: "pending",
  });
  const interactionsFrom = Date.parse(calendar.interactionsFrom);
  expect(interactionsFrom).toBeGreaterThanOrEqual(before);
  expect(Date.parse(calendar.syncWindowStart)).toBe(interactionsFrom - 30 * dayMs);
  const [row] = await f.db.select().from(calendars);
  expect(row!.nextSyncAt!.getTime()).toBe(interactionsFrom);
  expect(await f.accessLevel(f.alice, calendar.entityId)).toBe("owner");
});

test("connecting again updates the calendar; reconnecting a disconnected one restarts its sync", async () => {
  const { calendar, credentialAccountId } = await connectAlice();
  await syncCalendarEvents(f.db, calendar.entityId, [providerEvent({ providerEventId: "a" })]);
  const alice = await session("alice");
  await alice.calendar.update({ calendarEntityId: calendar.entityId, recordsInteractions: false });
  await alice.calendar.disconnect({ calendarEntityId: calendar.entityId });
  const otherAccount = await linkCalendarAccount(f.db, "alice");
  const {
    result: [reconnected],
  } = await alice.calendar.connect({
    credentialAccountId: otherAccount,
    calendars: [
      {
        providerCalendarId: "primary@example.com",
        name: "Renamed",
        color: "#ff0000",
        timeZone: "Europe/London",
        isPrimary: false,
      },
    ],
  });
  expect(reconnected).toMatchObject({
    entityId: calendar.entityId,
    name: "Renamed",
    color: "#ff0000",
    timeZone: "Europe/London",
    isPrimary: false,
    credentialAccountId: otherAccount,
    // Reconnecting keeps the owner's interaction setting.
    recordsInteractions: false,
    syncStatus: "pending",
  });
  expect(otherAccount).not.toBe(credentialAccountId);
  const [row] = await f.db.select().from(calendars);
  expect(row).toMatchObject({ syncCursor: null });
  expect(row!.nextSyncAt).not.toBeNull();
  expect(await f.db.select().from(calendars)).toHaveLength(1);
});

test("disconnect keeps the credential and the events, and stops syncing", async () => {
  const { calendar, credentialAccountId } = await connectAlice();
  await syncCalendarEvents(f.db, calendar.entityId, [providerEvent({ providerEventId: "a" })]);
  const alice = await session("alice");
  const { result } = await alice.calendar.disconnect({ calendarEntityId: calendar.entityId });
  expect(result).toMatchObject({ syncStatus: "disconnected", credentialAccountId });
  const [row] = await f.db.select().from(calendars);
  expect(row).toMatchObject({ syncCursor: null, nextSyncAt: null, syncLeaseToken: null });
  expect(await alice.calendar.events(range)).toHaveLength(1);
});

test("pause and resume change the sync schedule; interactions toggle separately", async () => {
  const { calendar } = await connectAlice();
  const alice = await session("alice");
  const calendarEntityId = calendar.entityId;
  const paused = await alice.calendar.update({ calendarEntityId, paused: true });
  expect(paused.result.syncStatus).toBe("paused");
  expect((await f.db.select().from(calendars))[0]!.nextSyncAt).toBeNull();
  expect(await rejection(alice.calendar.backfill({ calendarEntityId }))).toMatchObject({
    name: "ValidationError",
  });
  const resumed = await alice.calendar.update({ calendarEntityId, paused: false });
  expect(resumed.result.syncStatus).toBe("pending");
  expect((await f.db.select().from(calendars))[0]!.nextSyncAt).not.toBeNull();
  const recording = await alice.calendar.update({ calendarEntityId, recordsInteractions: false });
  expect(recording.result).toMatchObject({ recordsInteractions: false, syncStatus: "pending" });
  await alice.calendar.disconnect({ calendarEntityId });
  expect(await rejection(alice.calendar.backfill({ calendarEntityId }))).toMatchObject({
    name: "ValidationError",
  });
});

test("backfill moves both start times back a year, but never forward", async () => {
  const { calendar } = await connectAlice();
  const old = new Date("2020-01-01T00:00:00.000Z");
  await f.db
    .update(calendars)
    .set({ syncWindowStart: old, syncCursor: "cursor", syncStatus: "active" });
  const before = Date.now();
  const alice = await session("alice");
  const { result } = await alice.calendar.backfill({ calendarEntityId: calendar.entityId });
  expect(result.syncWindowStart).toBe(old.toISOString());
  const interactionsFrom = Date.parse(result.interactionsFrom);
  expect(interactionsFrom).toBeGreaterThanOrEqual(before - 365 * dayMs);
  expect(interactionsFrom).toBeLessThanOrEqual(Date.now() - 365 * dayMs);
  expect(result.syncStatus).toBe("pending");
  const [row] = await f.db.select().from(calendars);
  expect(row!.syncCursor).toBeNull();
});

test("only the owner reads or manages a calendar, even against an organization admin", async () => {
  const { calendar: aliceCalendar } = await connectAlice();
  const { calendar: bobCalendar } = await connectCalendar(f.db, {
    userId: "bob",
    organizationId: f.orgA,
    calendar: { providerCalendarId: "bob@example.com" },
  });
  await syncCalendarEvents(f.db, aliceCalendar.entityId, [providerEvent({ providerEventId: "a" })]);
  await syncCalendarEvents(f.db, bobCalendar.entityId, [providerEvent({ providerEventId: "b" })]);
  await f.verifyEmails();
  const alice = await session("alice");
  const bob = await session("bob");

  // Alice is the organization owner, Bob a member. Each sees only their own calendar.
  expect((await alice.calendar.events(range)).map((event) => event.calendarEntityId)).toEqual([
    aliceCalendar.entityId,
  ]);
  expect((await bob.calendar.events(range)).map((event) => event.calendarEntityId)).toEqual([
    bobCalendar.entityId,
  ]);
  expect(await rejection(alice.calendar.event(await eventId("b")))).toMatchObject({
    name: "AccessDeniedError",
  });
  expect(await rejection(bob.calendar.event(await eventId("a")))).toMatchObject({
    name: "AccessDeniedError",
  });
  const calendarEntityId = bobCalendar.entityId;
  for (const attempt of [
    () => alice.calendar.update({ calendarEntityId, recordsInteractions: true }),
    () => alice.calendar.disconnect({ calendarEntityId }),
    () => alice.calendar.backfill({ calendarEntityId }),
  ])
    expect(await rejection(attempt())).toMatchObject({ name: "AccessDeniedError" });
  const settings = await alice.calendar.settings();
  expect(
    settings.accounts.flatMap((value) => value.calendars).map((value) => value.entityId),
  ).toEqual([aliceCalendar.entityId]);
});

test("calendars are isolated by organization and calendar IDs must name calendars", async () => {
  const { calendar } = await connectAlice();
  await syncCalendarEvents(f.db, calendar.entityId, [providerEvent({ providerEventId: "a" })]);
  await f.verifyEmails();
  await enableCalendarApp(f.db, f.orgB);
  const outsider = await session("outsider", f.orgB);
  expect(await outsider.calendar.events(range)).toEqual([]);
  expect(await rejection(outsider.calendar.event(await eventId("a")))).toMatchObject({
    name: "AccessDeniedError",
  });
  expect(
    await rejection(outsider.calendar.disconnect({ calendarEntityId: calendar.entityId })),
  ).toMatchObject({ name: "AccessDeniedError" });

  const alice = await session("alice");
  const project = await f.forActor(f.alice).projects.create({ name: "Launch" });
  expect(
    await rejection(alice.calendar.disconnect({ calendarEntityId: project.entityId })),
  ).toMatchObject({ name: "AccessDeniedError" });
  expect(await rejection(alice.calendar.event(calendar.entityId))).toMatchObject({
    name: "AccessDeniedError",
  });
  expect(
    await rejection(alice.calendar.contactMeetings({ contactEntityId: calendar.entityId })),
  ).toMatchObject({ name: "AccessDeniedError" });
});

test("a disabled calendar app hides calendars and events", async () => {
  const { calendar } = await connectAlice();
  await syncCalendarEvents(f.db, calendar.entityId, [providerEvent({ providerEventId: "a" })]);
  await f.db
    .update(organizationApps)
    .set({ enabled: false })
    .where(eq(organizationApps.appId, "calendar"));
  const alice = await session("alice");
  expect(await alice.calendar.events(range)).toEqual([]);
  expect(await rejection(alice.calendar.settings())).toMatchObject({ name: "AppDisabledError" });
});

test("events lists readable, uncancelled events overlapping the period in start order", async () => {
  const { calendar } = await connectAlice();
  const { calendar: second } = await connectAlice({
    providerCalendarId: "second",
    isPrimary: false,
  });
  await syncCalendarEvents(f.db, calendar.entityId, [
    providerEvent({
      providerEventId: "late",
      startsAt: "2026-01-20T10:00:00.000Z",
      endsAt: "2026-01-20T11:00:00.000Z",
    }),
    providerEvent({
      providerEventId: "spanning",
      startsAt: "2025-12-31T23:00:00.000Z",
      endsAt: "2026-01-01T01:00:00.000Z",
      attendees: [
        providerAttendee("jane@customer.com"),
        providerAttendee("room@example.com", { isResource: true }),
      ],
    }),
    providerEvent({
      providerEventId: "before",
      startsAt: "2025-12-30T10:00:00.000Z",
      endsAt: "2025-12-30T11:00:00.000Z",
    }),
    providerEvent({ providerEventId: "cancelled", status: "cancelled" }),
  ]);
  await syncCalendarEvents(f.db, second.entityId, [providerEvent({ providerEventId: "other" })]);
  const alice = await session("alice");
  const all = await alice.calendar.events(range);
  expect(all.map((event) => [event.title, event.startsAt, event.calendarName])).toEqual([
    ["Meeting", "2025-12-31T23:00:00.000Z", "Work"],
    ["Meeting", "2026-01-01T10:00:00.000Z", "Work"],
    ["Meeting", "2026-01-20T10:00:00.000Z", "Work"],
  ]);
  expect(all[0]!.attendeeCount).toBe(1);
  const filtered = await alice.calendar.events({
    ...range,
    calendarEntityIds: [calendar.entityId],
  });
  expect(filtered.map((event) => event.entityId)).toEqual([
    await eventId("spanning"),
    await eventId("late"),
  ]);
});

test("events hide a Gmail copy of an invite the owner can read within 15 minutes", async () => {
  const { calendar } = await connectAlice();
  const { calendar: second } = await connectAlice({
    providerCalendarId: "second",
    isPrimary: false,
  });
  const { calendar: bobCalendar } = await connectCalendar(f.db, {
    userId: "bob",
    organizationId: f.orgA,
    calendar: { providerCalendarId: "bob@example.com" },
  });
  const at = (day: number, minutes = 0) =>
    new Date(Date.UTC(2026, 0, day, 10, minutes)).toISOString();
  const event = (providerEventId: string, day: number, minutes = 0) =>
    providerEvent({
      providerEventId,
      startsAt: at(day, minutes),
      endsAt: at(day, minutes + 30),
    });
  const gmail = (providerEventId: string, day: number) => ({
    ...event(providerEventId, day),
    kind: "from_gmail" as const,
  });
  await syncCalendarEvents(f.db, calendar.entityId, [
    // Day 2: the invite is on the same calendar and starts 15 minutes later.
    gmail("gmail-same", 2),
    event("invite-same", 2, 15),
    // Day 3: the invite is on the owner's other calendar.
    gmail("gmail-other-calendar", 3),
    // Day 4: no counterpart.
    gmail("gmail-unique", 4),
    // Day 5: the invite starts 20 minutes later.
    gmail("gmail-far", 5),
    event("invite-far", 5, 20),
    // Day 6: the counterpart is cancelled.
    gmail("gmail-cancelled", 6),
    { ...event("invite-cancelled", 6), status: "cancelled" },
    // Day 7: the counterpart is in another member's calendar.
    gmail("gmail-bob", 7),
    // Day 8: two Gmail copies of the same booking hide nothing.
    gmail("gmail-pair-a", 8),
    gmail("gmail-pair-b", 8),
  ]);
  await syncCalendarEvents(f.db, second.entityId, [event("invite-other-calendar", 3, -10)]);
  await syncCalendarEvents(f.db, bobCalendar.entityId, [event("invite-bob", 7)]);
  const alice = await session("alice");
  const listed = new Set((await alice.calendar.events(range)).map((value) => value.entityId));
  const hidden = ["gmail-same", "gmail-other-calendar"];
  const shown = [
    "invite-same",
    "invite-other-calendar",
    "gmail-unique",
    "gmail-far",
    "invite-far",
    "gmail-cancelled",
    "gmail-bob",
    "gmail-pair-a",
    "gmail-pair-b",
  ];
  for (const id of hidden) expect([id, listed.has(await eventId(id))]).toEqual([id, false]);
  for (const id of shown) expect([id, listed.has(await eventId(id))]).toEqual([id, true]);
  // The hidden copy is still stored and opens by its ID.
  const detail = await alice.calendar.event(await eventId("gmail-same"));
  expect(detail).toMatchObject({ kind: "from_gmail", startsAt: at(2) });
});

test("contact meetings hide a Gmail copy of a listed invite", async () => {
  const { calendar } = await connectAlice();
  const contact = await contactWithEmail("Jane", "jane@customer.com");
  const jane = [providerAttendee("jane@customer.com")];
  await syncCalendarEvents(f.db, calendar.entityId, [
    providerEvent({ providerEventId: "invite", attendees: jane }),
    providerEvent({ providerEventId: "gmail", kind: "from_gmail", attendees: jane }),
  ]);
  const alice = await session("alice");
  expect(
    (await alice.calendar.contactMeetings({ contactEntityId: contact.entityId })).map(
      (meeting) => meeting.entityId,
    ),
  ).toEqual([await eventId("invite")]);
});

test("summaries report the owner's own response, or null when the owner is not listed", async () => {
  const { calendar } = await connectAlice();
  const contact = await contactWithEmail("Jane", "jane@customer.com");
  const jane = providerAttendee("jane@customer.com");
  const self = (responseStatus: "accepted" | "declined") =>
    providerAttendee("alice@example.com", { isSelf: true, responseStatus });
  await syncCalendarEvents(f.db, calendar.entityId, [
    providerEvent({
      providerEventId: "accepted",
      startsAt: "2026-01-03T10:00:00.000Z",
      endsAt: "2026-01-03T11:00:00.000Z",
      attendees: [self("accepted"), jane],
    }),
    providerEvent({
      providerEventId: "declined",
      startsAt: "2026-01-02T10:00:00.000Z",
      endsAt: "2026-01-02T11:00:00.000Z",
      attendees: [self("declined"), jane],
    }),
    providerEvent({ providerEventId: "unlisted", attendees: [jane] }),
  ]);
  const alice = await session("alice");
  const expected = [
    [await eventId("unlisted"), null],
    [await eventId("declined"), "declined"],
    [await eventId("accepted"), "accepted"],
  ];
  expect(
    (await alice.calendar.events(range)).map((event) => [event.entityId, event.selfResponseStatus]),
  ).toEqual(expected);
  expect(
    (await alice.calendar.contactMeetings({ contactEntityId: contact.entityId })).map((event) => [
      event.entityId,
      event.selfResponseStatus,
    ]),
  ).toEqual([...expected].reverse());
  const details = [];
  for (const [entityId] of expected)
    details.push([entityId, (await alice.calendar.event(entityId!)).selfResponseStatus]);
  expect(details).toEqual(expected);
});

test("event detail derives attendee roles and matches the oldest readable contact", async () => {
  const { calendar } = await connectAlice();
  await f.verifyEmails();
  const older = await contactWithEmail("Jane Older", "jane@customer.com");
  await contactWithEmail("Jane Newer", "Jane@customer.com");
  await syncCalendarEvents(f.db, calendar.entityId, [
    providerEvent({
      providerEventId: "a",
      attendees: [
        providerAttendee("alice@example.com", { isSelf: true, isOrganizer: true }),
        providerAttendee("room@example.com", { isResource: true }),
        providerAttendee("BOB@example.com"),
        providerAttendee("declined@else.com", { responseStatus: "declined" }),
        providerAttendee("JANE@customer.com", { displayName: "Jane" }),
        providerAttendee("outside@example.com"),
      ],
    }),
  ]);
  const alice = await session("alice");
  const detail = await alice.calendar.event(await eventId("a"));
  expect(
    detail.attendees.map((attendee) => [attendee.email, attendee.role, attendee.contact]),
  ).toEqual([
    ["alice@example.com", "self", null],
    ["BOB@example.com", "member", null],
    ["declined@else.com", "declined", null],
    ["JANE@customer.com", "contact", { entityId: older.entityId, displayName: "Jane Older" }],
    // A verified user of another organization is not a member here.
    ["outside@example.com", "new_contact", null],
    ["room@example.com", "resource", null],
  ]);
  expect(detail).toMatchObject({ provider: "google", attendeeCount: 5 });
});

test("event outcome follows qualification, then the recorded interactions", async () => {
  const { calendar } = await connectAlice();
  await f.verifyEmails();
  const alice = await session("alice");
  const attendees = [
    providerAttendee("alice@example.com", { isSelf: true }),
    providerAttendee("jane@customer.com"),
  ];
  await syncCalendarEvents(f.db, calendar.entityId, [
    providerEvent({ providerEventId: "past", attendees }),
    providerEvent({
      providerEventId: "future",
      startsAt: "2027-01-01T10:00:00.000Z",
      endsAt: "2027-01-01T11:00:00.000Z",
      attendees,
    }),
    providerEvent({ providerEventId: "focus", kind: "focus_time", attendees }),
  ]);
  const outcome = async (id: string) => (await alice.calendar.event(await eventId(id))).outcome;
  expect(await outcome("past")).toEqual({ state: "skipped", reason: "before_interactions_from" });
  await alice.calendar.update({ calendarEntityId: calendar.entityId, recordsInteractions: false });
  expect(await outcome("past")).toEqual({ state: "skipped", reason: "interactions_off" });
  await alice.calendar.update({ calendarEntityId: calendar.entityId, recordsInteractions: true });
  await alice.calendar.backfill({ calendarEntityId: calendar.entityId });
  expect(await outcome("past")).toEqual({ state: "pending" });
  expect(await outcome("future")).toEqual({ state: "upcoming" });
  expect(await outcome("focus")).toEqual({ state: "skipped", reason: "not_a_meeting" });

  const past = await eventId("past");
  await f.db
    .update(calendarEvents)
    .set({ interactionsRecordedAt: new Date() })
    .where(eq(calendarEvents.entityId, past));
  expect(await outcome("past")).toEqual({ state: "skipped", reason: "no_external_attendees" });

  const contact = await contactWithEmail("Jane", "jane@customer.com");
  const interaction = await contactInteractionRepository(
    new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.alice }),
  ).createManual({
    contactEntityId: contact.entityId,
    kind: "meeting",
    occurredAt: new Date("2026-01-01T10:00:00.000Z"),
    summary: "Meeting",
  });
  await f.db.insert(entityLinks).values({
    organizationId: f.orgA,
    ...relatedPair(past, interaction.entityId),
    relationType: "related_to",
    createdByActorEntityId: f.alice,
  });
  const detail = await alice.calendar.event(past);
  expect(detail.outcome).toEqual({ state: "recorded" });
  expect(detail.interactions).toEqual([
    { entityId: interaction.entityId, contactEntityId: contact.entityId, contactName: "Jane" },
  ]);
  expect(await alice.calendar.interactionSourceEvents([interaction.entityId])).toEqual({
    [interaction.entityId]: {
      entityId: past,
      title: "Meeting",
      startsAt: "2026-01-01T10:00:00.000Z",
    },
  });
  // Bob reads the interaction, but not the meeting behind it.
  expect(
    await (await session("bob")).calendar.interactionSourceEvents([interaction.entityId]),
  ).toEqual({});
});

test("contact meetings match the contact's emails in readable calendars, newest first", async () => {
  const { calendar } = await connectAlice();
  const { calendar: bobCalendar } = await connectCalendar(f.db, {
    userId: "bob",
    organizationId: f.orgA,
    calendar: { providerCalendarId: "bob@example.com" },
  });
  await f.verifyEmails();
  const contact = await contactWithEmail("Jane", "Jane@customer.com");
  const jane = [providerAttendee("jane@customer.com")];
  await syncCalendarEvents(f.db, calendar.entityId, [
    providerEvent({ providerEventId: "older", attendees: jane }),
    providerEvent({
      providerEventId: "newer",
      startsAt: "2026-03-01T10:00:00.000Z",
      endsAt: "2026-03-01T11:00:00.000Z",
      attendees: jane,
    }),
    providerEvent({ providerEventId: "cancelled", status: "cancelled", attendees: jane }),
    providerEvent({ providerEventId: "unrelated", attendees: [providerAttendee("x@else.com")] }),
  ]);
  await syncCalendarEvents(f.db, bobCalendar.entityId, [
    providerEvent({ providerEventId: "bobs", attendees: jane }),
  ]);
  const alice = await session("alice");
  const meetings = await alice.calendar.contactMeetings({ contactEntityId: contact.entityId });
  expect(meetings.map((meeting) => meeting.entityId)).toEqual([
    await eventId("newer"),
    await eventId("older"),
  ]);
  expect(
    (await alice.calendar.contactMeetings({ contactEntityId: contact.entityId, limit: 1 })).length,
  ).toBe(1);
  const bob = await session("bob");
  expect(
    (await bob.calendar.contactMeetings({ contactEntityId: contact.entityId })).map(
      (meeting) => meeting.entityId,
    ),
  ).toEqual([await eventId("bobs")]);
});

test("settings list the user's provider accounts, their calendars, and detached calendars", async () => {
  const payload = Buffer.from(JSON.stringify({ email: "alice@gmail.com" })).toString("base64url");
  await f.verifyEmails();
  await enableCalendarApp(f.db, f.orgA);
  const withToken = await linkCalendarAccount(f.db, "alice", { idToken: `h.${payload}.s` });
  const withoutScope = await linkCalendarAccount(f.db, "alice", { scope: "openid,email" });
  const { calendar } = await connectCalendar(f.db, {
    userId: "alice",
    organizationId: f.orgA,
    credentialAccountId: withToken,
  });
  const { calendar: detached } = await connectCalendar(f.db, {
    userId: "alice",
    organizationId: f.orgA,
    credentialAccountId: withoutScope,
    calendar: { providerCalendarId: "old@example.com" },
  });
  await f.db
    .update(calendars)
    .set({ syncStatus: "disconnected", credentialAccountId: null })
    .where(eq(calendars.entityId, detached.entityId));
  await linkCalendarAccount(f.db, "bob");
  const settings = await (await session("alice")).calendar.settings();
  expect(
    settings.accounts.map((value) => [
      value.credentialAccountId,
      value.email,
      value.hasCalendarAccess,
      value.calendars.map((item) => item.entityId),
    ]),
  ).toEqual([
    [withToken, "alice@gmail.com", true, [calendar.entityId]],
    [withoutScope, null, false, []],
  ]);
  expect(settings.detachedCalendars.map((value) => value.entityId)).toEqual([detached.entityId]);
});
