/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";

const f = setupDatabase();

test("calendar events inherit access and support timed and all-day values", async () => {
  const owner = f.forActor(f.alice);
  const calendar = await owner.calendars.create({ name: "Work", timeZone: "America/New_York" });
  const event = await owner.calendarEvents.create({
    calendarEntityId: calendar.entityId,
    title: "Meeting",
    timing: {
      allDay: false,
      startsAt: new Date("2026-11-05T15:00:00Z"),
      endsAt: new Date("2026-11-05T16:00:00Z"),
      timeZone: "America/New_York",
    },
  });
  const allDay = await owner.calendarEvents.create({
    calendarEntityId: calendar.entityId,
    title: "Holiday",
    timing: {
      allDay: true,
      startsOn: "2026-11-06",
      endsOn: "2026-11-07",
      timeZone: "America/New_York",
    },
  });
  expect(allDay.startsAt).toBeNull();
  expect(allDay.startsOn).toBe("2026-11-06");
  await owner.permissions.grant({
    entityId: calendar.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect((await f.forActor(f.bob).calendarEvents.get(event.entityId)).timeZone).toBe(
    "America/New_York",
  );
  expect(await f.forActor(f.bob).calendarEvents.list(calendar.entityId)).toHaveLength(2);
  await expect(
    f.forActor(f.bob).calendarEvents.update(event.entityId, { title: "Denied" }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  const changed = await owner.calendarEvents.update(event.entityId, {
    timing: {
      allDay: true,
      startsOn: "2026-11-05",
      endsOn: "2026-11-06",
      timeZone: "America/New_York",
    },
  });
  expect(changed.startsAt).toBeNull();
  expect(changed.endsAt).toBeNull();
  expect(changed.startsOn).toBe("2026-11-05");
});

test("invalid timing rolls back the event and its registry record", async () => {
  const owner = f.forActor(f.alice);
  const calendar = await owner.calendars.create({ name: "Work", timeZone: "UTC" });
  await expect(
    owner.calendarEvents.create({
      calendarEntityId: calendar.entityId,
      title: "Backwards",
      timing: {
        allDay: false,
        startsAt: new Date("2026-11-05T16:00:00Z"),
        endsAt: new Date("2026-11-05T15:00:00Z"),
        timeZone: "UTC",
      },
    }),
  ).rejects.toThrow();
  expect(await owner.calendarEvents.list(calendar.entityId)).toEqual([]);
  await expect(
    f
      .forActor(f.outsider, f.orgB)
      .calendarEvents.create({
        calendarEntityId: calendar.entityId,
        title: "Wrong organization",
        timing: { allDay: true, startsOn: "2026-11-05", endsOn: "2026-11-06", timeZone: "UTC" },
      }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});
