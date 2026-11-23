import { realtimeKeys } from "@substrate/contracts/realtime";

import { contactInteractions } from "../../core/contacts/interactions.schema";
import { contactIdentifiers, contacts } from "../../core/contacts/schema";
import { entityLinks } from "../../core/links/schema";
import { enableCalendar, insertCalendar, insertMeeting } from "../../testing/calendar-completion";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { crmActivityEvents } from "../crm/activity.schema";
import { claimEndedMeetings, recordMeetingInteractions } from "./completion";
import { endedMeetingsQuery } from "./completion-queries";
import { calendarEvents, calendars } from "./schema";
import { expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";

const f = setupDatabase();
const now = new Date("2026-11-20T12:00:00Z");

const claimed = async () =>
  (await claimEndedMeetings(f.db, { limit: 50, now })).map((row) => row.eventEntityId);
const record = (eventEntityId: string, organizationId = f.orgA) =>
  recordMeetingInteractions(f.db, { organizationId, eventEntityId, now });
const recordedAt = async (eventEntityId: string) =>
  (
    await f.db
      .select({ at: calendarEvents.interactionsRecordedAt })
      .from(calendarEvents)
      .where(eq(calendarEvents.entityId, eventEntityId))
  )[0]!.at;

/** A contact in the organization with a primary email, created through the session API. */
async function contactWithEmail(
  name: string,
  email: string,
  userId = "alice",
  organizationId = f.orgA,
) {
  const session = await f.forSession(userId, organizationId);
  const { result } = await session.contacts.createContact({ displayName: name });
  await session.contacts.addIdentifier(result.entityId, {
    type: "email",
    value: email,
    isPrimary: true,
  });
  return result.entityId;
}

test("an ended meeting creates interactions for an existing and a new contact", async () => {
  await enableCalendar(f);
  const calendar = await insertCalendar(f);
  const known = await contactWithEmail("Known Client", "known@client.com");
  const meeting = await insertMeeting(f, calendar, {
    title: "  Quarterly review ",
    startsAt: new Date("2026-11-10T10:00:00Z"),
    endsAt: new Date("2026-11-10T10:30:00Z"),
    attendees: [
      { email: "known@client.com", displayName: "Someone Else" },
      { email: "New.Person@Example.com", displayName: "New Person" },
    ],
  });

  expect(await claimed()).toEqual([meeting]);
  const { result, hints } = await record(meeting);

  expect(result.createdContactEntityIds).toHaveLength(1);
  const created = result.createdContactEntityIds[0]!;
  const [newContact] = await f.db.select().from(contacts).where(eq(contacts.entityId, created));
  expect(newContact).toMatchObject({ organizationId: f.orgA, displayName: "New Person" });
  expect(
    await f.db
      .select({
        value: contactIdentifiers.value,
        normalizedValue: contactIdentifiers.normalizedValue,
        isPrimary: contactIdentifiers.isPrimary,
      })
      .from(contactIdentifiers)
      .where(eq(contactIdentifiers.contactEntityId, created)),
  ).toEqual([
    { value: "New.Person@Example.com", normalizedValue: "New.Person@example.com", isPrimary: true },
  ]);

  const interactions = await f.db.select().from(contactInteractions);
  expect(interactions.map((row) => row.entityId).sort()).toEqual(
    [...result.interactionEntityIds].sort(),
  );
  expect(interactions.map((row) => row.contactEntityId).sort()).toEqual([known, created].sort());
  for (const interaction of interactions)
    expect(interaction).toMatchObject({
      kind: "meeting",
      occurredAt: new Date("2026-11-10T10:00:00Z"),
      endedAt: new Date("2026-11-10T10:30:00Z"),
      summary: "Quarterly review",
      origin: "calendar_event",
      createdByActorEntityId: f.alice,
    });

  const links = await f.db.select().from(entityLinks);
  expect(links).toHaveLength(2);
  for (const link of links) {
    expect(link).toMatchObject({ relationType: "related_to", createdByActorEntityId: f.alice });
    expect([link.sourceEntityId, link.targetEntityId]).toContain(meeting);
    expect(link.sourceEntityId < link.targetEntityId).toBe(true);
  }

  const activity = await f.db
    .select({ entityId: crmActivityEvents.entityId, action: crmActivityEvents.action })
    .from(crmActivityEvents)
    .where(eq(crmActivityEvents.actorEntityId, f.alice));
  expect(activity).toEqual(
    expect.arrayContaining([
      { entityId: created, action: "created" },
      { entityId: created, action: "interaction_created" },
      { entityId: known, action: "interaction_created" },
    ]),
  );
  for (const contact of [known, created])
    expect(hints).toContainEqual({
      audience: realtimeKeys.entity(f.orgA, contact),
      domain: "context",
    });
  expect(await recordedAt(meeting)).toEqual(now);
});

const contactName = async (entityId: string) =>
  (
    await f.db
      .select({ name: contacts.displayName })
      .from(contacts)
      .where(eq(contacts.entityId, entityId))
  )[0]!.name;

test("a new contact without a display name is named from its email", async () => {
  await enableCalendar(f);
  const meeting = await insertMeeting(f, await insertCalendar(f), {
    attendees: [
      { email: "tobias@fernhollow.test" },
      { email: "john.smith@client.com", displayName: "john.smith@client.com" },
      { email: "info@client.com" },
      { email: "quill907@mail.test" },
      { email: "pat@client.com", displayName: "  Patricia Doe " },
    ],
  });
  const { result } = await record(meeting);
  const names = await Promise.all(result.createdContactEntityIds.map(contactName));
  expect(names.sort()).toEqual(
    ["Tobias", "John Smith", "info@client.com", "quill907@mail.test", "Patricia Doe"].sort(),
  );
});

test("an auto-named contact takes the display name, or the derived name, as the owner", async () => {
  await enableCalendar(f);
  const byEmail = await contactWithEmail("tobias@fernhollow.test", "tobias@fernhollow.test");
  const derived = await contactWithEmail("wren", "Wren@coldharbor.test");
  const role = await contactWithEmail("team@client.com", "team@client.com");
  const meeting = await insertMeeting(f, await insertCalendar(f), {
    attendees: [
      { email: "tobias@fernhollow.test" },
      { email: "Wren@coldharbor.test", displayName: "Wren Halvorsen" },
      { email: "team@client.com" },
    ],
  });
  const { result, hints } = await record(meeting);

  expect(result.createdContactEntityIds).toEqual([]);
  expect(await contactName(byEmail)).toBe("Tobias");
  expect(await contactName(derived)).toBe("Wren Halvorsen");
  expect(await contactName(role)).toBe("team@client.com");
  const updates = await f.db
    .select({ entityId: crmActivityEvents.entityId, actor: crmActivityEvents.actorEntityId })
    .from(crmActivityEvents)
    .where(eq(crmActivityEvents.action, "updated"));
  expect(updates.sort((a, b) => a.entityId.localeCompare(b.entityId))).toEqual(
    [byEmail, derived].sort().map((entityId) => ({ entityId, actor: f.alice })),
  );
  expect(hints).toContainEqual({
    audience: realtimeKeys.entity(f.orgA, byEmail),
    domain: "context",
  });
});

test("a name a person typed is never replaced", async () => {
  await enableCalendar(f);
  const renamed = await contactWithEmail("tobias@fernhollow.test", "tobias@fernhollow.test");
  await (await f.forSession("bob")).contacts.updateContact(renamed, { displayName: "Tobi S." });
  const meeting = await insertMeeting(f, await insertCalendar(f), {
    attendees: [{ email: "tobias@fernhollow.test", displayName: "Tobias Grant" }],
  });
  const { result } = await record(meeting);
  expect(result.interactionEntityIds).toHaveLength(1);
  expect(await contactName(renamed)).toBe("Tobi S.");
});

test("a second run creates nothing and the meeting is no longer claimed", async () => {
  await enableCalendar(f);
  const meeting = await insertMeeting(f, await insertCalendar(f), {
    attendees: [{ email: "guest@client.com" }],
  });
  const first = await record(meeting);
  expect(first.result.interactionEntityIds).toHaveLength(1);

  const second = await record(meeting);
  expect(second.result).toEqual({ interactionEntityIds: [], createdContactEntityIds: [] });
  expect(await f.db.select().from(contactInteractions)).toHaveLength(1);
  expect(await f.db.select().from(contacts)).toHaveLength(1);
  expect(await f.db.select().from(entityLinks)).toHaveLength(1);
  expect(await claimed()).toEqual([]);
});

test("the owner, rooms, decliners, and verified members are not recorded", async () => {
  await enableCalendar(f);
  const meeting = await insertMeeting(f, await insertCalendar(f), {
    attendees: [
      { email: "alice@example.com", isSelf: true, responseStatus: "accepted" },
      { email: "room-4@resource.calendar.google.com", isResource: true },
      { email: "declined@client.com", responseStatus: "declined" },
      { email: "BOB@example.com" },
      // A member of another organization is outside this one.
      { email: "outside@example.com" },
    ],
  });
  const { result } = await record(meeting);
  const recorded = await f.db
    .select({ email: contactIdentifiers.value })
    .from(contactInteractions)
    .innerJoin(
      contactIdentifiers,
      eq(contactIdentifiers.contactEntityId, contactInteractions.contactEntityId),
    );
  expect(recorded).toEqual([{ email: "outside@example.com" }]);
  expect(result.createdContactEntityIds).toHaveLength(1);
});

test("a meeting with only members is marked without interactions", async () => {
  await enableCalendar(f);
  const meeting = await insertMeeting(f, await insertCalendar(f), {
    attendees: [{ email: "bob@example.com" }],
  });
  expect((await record(meeting)).result).toEqual({
    interactionEntityIds: [],
    createdContactEntityIds: [],
  });
  expect(await recordedAt(meeting)).toEqual(now);
});

test("event-level skips are marked; focus time is never claimed", async () => {
  await enableCalendar(f);
  const calendar = await insertCalendar(f);
  const crowd = await insertMeeting(f, calendar, {
    attendees: Array.from({ length: 15 }, (_, index) => ({ email: `guest${index}@client.com` })),
  });
  const secret = await insertMeeting(f, calendar, {
    visibility: "private",
    attendees: [{ email: "guest@client.com" }],
  });
  const focus = await insertMeeting(f, calendar, { kind: "focus_time" });

  expect((await claimed()).sort()).toEqual([crowd, secret].sort());
  expect(await claimed()).not.toContain(focus);
  for (const meeting of [crowd, secret]) {
    expect((await record(meeting)).result).toEqual({
      interactionEntityIds: [],
      createdContactEntityIds: [],
    });
    expect(await recordedAt(meeting)).toEqual(now);
  }
  expect(await f.db.select().from(contacts)).toEqual([]);
  expect(await claimed()).toEqual([]);
});

test("calendar gates hold a meeting back unmarked until a backfill makes it eligible", async () => {
  await enableCalendar(f);
  const off = await insertCalendar(f, { recordsInteractions: false });
  const offMeeting = await insertMeeting(f, off, { attendees: [{ email: "guest@client.com" }] });
  const late = await insertCalendar(f, { interactionsFrom: new Date("2026-11-15T00:00:00Z") });
  const early = await insertMeeting(f, late, { attendees: [{ email: "guest@client.com" }] });

  expect(await claimed()).toEqual([]);
  for (const meeting of [offMeeting, early]) {
    expect((await record(meeting)).result.interactionEntityIds).toEqual([]);
    expect(await recordedAt(meeting)).toBeNull();
  }

  await f.db
    .update(calendars)
    .set({ interactionsFrom: new Date("2025-11-15T00:00:00Z") })
    .where(eq(calendars.entityId, late));
  expect(await claimed()).toEqual([early]);
  expect((await record(early)).result.interactionEntityIds).toHaveLength(1);
});

test("a disabled calendar app holds meetings back", async () => {
  await enableCalendar(f);
  const meeting = await insertMeeting(f, await insertCalendar(f), {
    attendees: [{ email: "guest@client.com" }],
  });
  await f.db.execute(sql`UPDATE organization_apps SET enabled = false WHERE app_id = 'calendar'`);
  expect(await claimed()).toEqual([]);
  expect((await record(meeting)).result.interactionEntityIds).toEqual([]);
  expect(await recordedAt(meeting)).toBeNull();
});

test("an upcoming meeting is neither claimed nor marked", async () => {
  await enableCalendar(f);
  const meeting = await insertMeeting(f, await insertCalendar(f), {
    endsAt: new Date("2026-11-20T13:00:00Z"),
    attendees: [{ email: "guest@client.com" }],
  });
  expect(await claimed()).toEqual([]);
  expect((await record(meeting)).result.interactionEntityIds).toEqual([]);
  expect(await recordedAt(meeting)).toBeNull();
});

test("a contact archived in CRM is skipped, and no duplicate is created", async () => {
  await enableCalendar(f);
  const archived = await contactWithEmail("Former Client", "former@client.com");
  await (await f.forSession("alice")).contacts.archive(archived, true);
  const meeting = await insertMeeting(f, await insertCalendar(f), {
    attendees: [{ email: "former@client.com" }],
  });
  expect((await record(meeting)).result).toEqual({
    interactionEntityIds: [],
    createdContactEntityIds: [],
  });
  expect(await f.db.select({ id: contacts.entityId }).from(contacts)).toEqual([{ id: archived }]);
  expect(await recordedAt(meeting)).toEqual(now);
});

test("the oldest contact with the email is used", async () => {
  await enableCalendar(f);
  const older = await contactWithEmail("First", "twin@client.com");
  await contactWithEmail("Second", "twin@client.com");
  const meeting = await insertMeeting(f, await insertCalendar(f), {
    attendees: [{ email: "twin@client.com" }],
  });
  await record(meeting);
  expect(
    await f.db.select({ contact: contactInteractions.contactEntityId }).from(contactInteractions),
  ).toEqual([{ contact: older }]);
});

test("a contact with the same email in another organization is not used", async () => {
  await enableCalendar(f);
  const foreign = await contactWithEmail("Foreign", "shared@client.com", "outsider", f.orgB);
  const meeting = await insertMeeting(f, await insertCalendar(f), {
    attendees: [{ email: "shared@client.com" }],
  });
  const { result } = await record(meeting);
  expect(result.createdContactEntityIds).toHaveLength(1);
  expect(result.createdContactEntityIds).not.toContain(foreign);
  const [interaction] = await f.db.select().from(contactInteractions);
  expect(interaction).toMatchObject({
    organizationId: f.orgA,
    contactEntityId: result.createdContactEntityIds[0],
  });
});

test("colleagues read the interaction but not the meeting or its link", async () => {
  await enableCalendar(f);
  const meeting = await insertMeeting(f, await insertCalendar(f), {
    attendees: [{ email: "guest@client.com" }],
  });
  const {
    result: { interactionEntityIds },
  } = await record(meeting);
  const interaction = interactionEntityIds[0]!;

  const bob = f.forActor(f.bob);
  expect((await bob.contactInteractions.get(interaction)).summary).toBe("Quarterly review");
  expect(await rejection(bob.entities.get(meeting))).toMatchObject({ name: "AccessDeniedError" });
  expect(await bob.links.list(interaction)).toEqual([]);
  expect(await f.forActor(f.alice).links.list(interaction)).toHaveLength(1);
});

test("the claim can use the completion index", async () => {
  const plan = await f.db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL enable_seqscan = off`);
    return tx.execute<{ "QUERY PLAN": string }>(sql`EXPLAIN ${endedMeetingsQuery(tx, 10, now)}`);
  });
  expect(plan.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
    "calendar_events_completion_idx",
  );
});

test("a deleted event is not claimed", async () => {
  await enableCalendar(f);
  const meeting = await insertMeeting(f, await insertCalendar(f), {
    attendees: [{ email: "guest@client.com" }],
  });
  await f.db.execute(sql`UPDATE entities SET deleted_at = now() WHERE entity_id = ${meeting}`);
  expect(await claimed()).toEqual([]);
  expect((await record(meeting)).result.interactionEntityIds).toEqual([]);
  expect(
    await f.db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.entityId, meeting), sql`interactions_recorded_at IS NULL`)),
  ).toHaveLength(1);
});
