/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";

const f = setupDatabase();

test("attendees preserve snapshots but do not expose private contact IDs or grant access", async () => {
  const repo = f.forActor(f.alice);
  const calendar = await repo.calendars.create({ name: "Work", timeZone: "UTC" });
  const event = await repo.calendarEvents.create({
    calendarEntityId: calendar.entityId,
    title: "Meeting",
    timing: { allDay: true, startsOn: "2026-11-05", endsOn: "2026-11-06", timeZone: "UTC" },
  });
  const contact = await repo.contacts.create({ displayName: "Private contact" });
  await repo.calendarEvents.addAttendee(event.entityId, {
    address: " BOB@EXAMPLE.COM ",
    displayName: "Bob",
    contactEntityId: contact.entityId,
    response: "accepted",
  });
  await expect(f.forActor(f.bob).calendarEvents.get(event.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await repo.permissions.grant({
    entityId: calendar.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const attendees = await f.forActor(f.bob).calendarEvents.listAttendees(event.entityId);
  expect(attendees).toEqual([
    { address: "bob@example.com", displayName: "Bob", contactEntityId: null, response: "accepted" },
  ]);
  expect((await repo.calendarEvents.listAttendees(event.entityId))[0]?.contactEntityId).toBe(
    contact.entityId,
  );
  await expect(
    f.forActor(f.bob).calendarEvents.removeAttendee(event.entityId, "bob@example.com"),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await repo.calendarEvents.removeAttendee(event.entityId, "BOB@EXAMPLE.COM");
  expect(await repo.calendarEvents.listAttendees(event.entityId)).toEqual([]);
});
