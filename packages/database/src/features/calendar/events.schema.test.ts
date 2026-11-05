/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { setupDatabase } from "../../testing/database";
import { calendarEvents } from "./events.schema";
import { eventAttendees } from "./attendees.schema";
import { calendarIntegrations } from "./integrations.schema";

const f = setupDatabase();

test("events, attendees, and access parents must agree on the calendar", async () => {
  const repo = f.forActor(f.alice);
  const a = await repo.calendars.create({ name: "A", timeZone: "UTC" });
  const b = await repo.calendars.create({ name: "B", timeZone: "UTC" });
  const event = await repo.calendarEvents.create({
    calendarEntityId: a.entityId,
    title: "Meeting",
    timing: { allDay: true, startsOn: "2026-11-05", endsOn: "2026-11-06", timeZone: "UTC" },
  });
  await expect(
    f.db
      .update(calendarEvents)
      .set({ calendarEntityId: b.entityId })
      .where(eq(calendarEvents.entityId, event.entityId))
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    f.db
      .insert(eventAttendees)
      .values({
        organizationId: f.orgA,
        eventEntityId: event.entityId,
        calendarEntityId: b.entityId,
        address: "person@example.com",
      })
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    f.db
      .update(calendarEvents)
      .set({ startsAt: new Date() })
      .where(eq(calendarEvents.entityId, event.entityId))
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23514" } });
  await expect(
    f.db
      .insert(calendarIntegrations)
      .values({
        organizationId: f.orgA,
        calendarEntityId: a.entityId,
        provider: "google",
        externalAccountId: "a",
        externalResourceId: "a",
        credentialReference: "vault/a",
        connectedByActorEntityId: f.outsider,
      })
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});
