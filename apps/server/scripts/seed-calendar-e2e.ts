import {
  googleCalendarScope,
  type ProviderCalendarAttendee,
  type ProviderCalendarEvent,
} from "@substrate/contracts/calendar";
import { createRepositories } from "@substrate/database";
import { commitCalendarSync, recordMeetingInteractions } from "@substrate/database/calendar";
import { account, calendarEvents, calendars, member, user } from "@substrate/database/schema";
import { createDatabase } from "@substrate/database/trusted";

import { and, eq } from "drizzle-orm";

const connectionString =
  process.env.E2E_DATABASE_URL ??
  "postgres://substrate_e2e:substrate_e2e@localhost:5434/substrate_e2e_test";
const url = new URL(connectionString);
if (
  process.env.NODE_ENV !== "test" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !url.pathname.endsWith("_e2e_test")
)
  throw new Error("Calendar fixtures require a local E2E database and NODE_ENV=test.");
const [email, organizationId] = process.argv.slice(2);
if (!email || !organizationId) throw new Error("A fixture account and organization are required.");

const { db, close } = createDatabase({ connectionString, maxConnections: 1 });
try {
  const fixture = await db.transaction(async (tx) => {
    const owners = await tx
      .select({ userId: user.id })
      .from(user)
      .innerJoin(member, eq(member.userId, user.id))
      .where(
        and(
          eq(user.email, email),
          eq(user.emailVerified, true),
          eq(member.organizationId, organizationId),
        ),
      );
    const owner = owners.at(0);
    if (!owner) throw new Error("The verified fixture account must belong to the organization.");
    const credentialAccountId = crypto.randomUUID();
    await tx.insert(account).values({
      id: credentialAccountId,
      userId: owner.userId,
      accountId: `e2e-${credentialAccountId}`,
      providerId: "google",
      scope: `openid,email,${googleCalendarScope}`,
    });
    const repositories = await createRepositories(tx).forSession({
      userId: owner.userId,
      organizationId,
    });
    const { result: connected } = await repositories.calendar.connect({
      credentialAccountId,
      calendars: [
        {
          providerCalendarId: email,
          name: "Customer meetings",
          color: null,
          timeZone: "UTC",
          isPrimary: true,
        },
      ],
    });
    const calendarEntityId = connected[0]!.entityId;
    const leaseToken = crypto.randomUUID();
    const windowStart = new Date("2020-01-01T00:00:00Z");
    const updated = await tx
      .update(calendars)
      .set({
        interactionsFrom: windowStart,
        syncWindowStart: windowStart,
        syncLeaseToken: leaseToken,
        syncLeaseExpiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(calendars.entityId, calendarEntityId))
      .returning();
    const calendar = updated.at(0);
    if (!calendar) throw new Error("The fixture calendar was not connected.");
    const attendee = (
      email: string,
      displayName: string,
      isSelf = false,
    ): ProviderCalendarAttendee => ({
      email,
      displayName,
      responseStatus: "accepted",
      isOrganizer: isSelf,
      isSelf,
      isOptional: false,
      isResource: false,
    });
    const event = (privateEvent: boolean): ProviderCalendarEvent => ({
      providerEventId: privateEvent ? "private-review" : "pricing-review",
      icalUid: null,
      recurringEventId: null,
      kind: "default",
      status: "confirmed",
      title: privateEvent ? "Private review" : "Pricing review",
      description: "Review the customer rollout.",
      location: null,
      conferenceUrl: null,
      htmlLink: null,
      visibility: privateEvent ? "private" : "default",
      startsAt: "2020-01-15T10:00:00Z",
      endsAt: "2020-01-15T10:30:00Z",
      allDay: false,
      timeZone: "UTC",
      providerUpdatedAt: null,
      attendees: [
        attendee(email, "Calendar owner", true),
        attendee(
          privateEvent ? "private-guest@example.test" : "jordan@example.test",
          privateEvent ? "Private guest" : "Jordan Lee",
        ),
      ],
    });
    const { result: synced } = await commitCalendarSync(tx, {
      claim: {
        organizationId,
        calendarEntityId,
        ownerUserId: owner.userId,
        ownerActorEntityId: calendar.ownerActorEntityId,
        credentialAccountId,
        provider: "google",
        providerCalendarId: email,
        syncCursor: null,
        syncWindowStart: windowStart,
        leaseToken,
      },
      result: {
        fullSync: true,
        events: [
          event(false),
          event(true),
          {
            ...event(false),
            providerEventId: "planning-day",
            title: "Planning day",
            startsAt: "2020-01-15T00:00:00Z",
            endsAt: "2020-01-16T00:00:00Z",
            allDay: true,
            attendees: [],
          },
        ],
        cancelledEventIds: [],
        nextCursor: "e2e-cursor",
      },
    });
    if (!synced.committed) throw new Error("The fixture sync did not commit.");
    const events = await tx
      .select({
        entityId: calendarEvents.entityId,
        providerEventId: calendarEvents.providerEventId,
      })
      .from(calendarEvents)
      .where(eq(calendarEvents.calendarEntityId, calendarEntityId));
    const meeting = events.find((event) => event.providerEventId === "pricing-review");
    const privateMeeting = events.find((event) => event.providerEventId === "private-review");
    if (!meeting || !privateMeeting) throw new Error("The fixture meetings were not synced.");
    const { result: recorded } = await recordMeetingInteractions(tx, {
      organizationId,
      eventEntityId: meeting.entityId,
    });
    await recordMeetingInteractions(tx, { organizationId, eventEntityId: privateMeeting.entityId });
    const contactEntityId = recorded.createdContactEntityIds[0];
    if (!contactEntityId || recorded.interactionEntityIds.length !== 1)
      throw new Error("The fixture meeting must record one contact interaction.");
    // Keep reads active, but never let the background worker call Google for this fixture.
    await tx
      .update(calendars)
      .set({ nextSyncAt: null })
      .where(eq(calendars.entityId, calendarEntityId));
    return { eventId: meeting.entityId, privateEventId: privateMeeting.entityId, contactEntityId };
  });
  console.log(JSON.stringify(fixture));
} finally {
  await close();
}
