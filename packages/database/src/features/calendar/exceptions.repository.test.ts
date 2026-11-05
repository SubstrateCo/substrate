/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { setupDatabase } from "../../testing/database";

const f = setupDatabase();

test("recurrence exceptions support cancellations and same-calendar replacements", async () => {
  const repo = f.forActor(f.alice);
  const calendar = await repo.calendars.create({ name: "Work", timeZone: "UTC" });
  const base = {
    calendarEntityId: calendar.entityId,
    title: "Standup",
    timing: {
      allDay: true as const,
      startsOn: "2026-11-05",
      endsOn: "2026-11-06",
      timeZone: "UTC",
    },
  };
  const series = await repo.calendarEvents.create({ ...base, recurrenceRule: "FREQ=DAILY" });
  const replacement = await repo.calendarEvents.create(base);
  await repo.calendarEvents.setException(series.entityId, {
    occurrenceKey: "20261105",
    cancelled: true,
  });
  await repo.calendarEvents.setException(series.entityId, {
    occurrenceKey: "20261106",
    cancelled: false,
    replacementEventEntityId: replacement.entityId,
  });
  const exceptions = await repo.calendarEvents.listExceptions(series.entityId);
  expect(exceptions.map((exception) => exception.cancelled)).toEqual([true, false]);
  expect(exceptions[1]?.replacementEventEntityId).toBe(replacement.entityId);
  await repo.permissions.grant({ entityId: series.entityId, actorEntityId: f.bob, level: "view" });
  expect(await f.forActor(f.bob).calendarEvents.listExceptions(series.entityId)).toHaveLength(1);
  await expect(
    f
      .forActor(f.bob)
      .calendarEvents.setException(series.entityId, { occurrenceKey: "20261107", cancelled: true }),
  ).rejects.toThrow();
  const otherCalendar = await repo.calendars.create({ name: "Other", timeZone: "UTC" });
  const wrongCalendar = await repo.calendarEvents.create({
    ...base,
    calendarEntityId: otherCalendar.entityId,
  });
  await expect(
    repo.calendarEvents.setException(series.entityId, {
      occurrenceKey: "20261107",
      cancelled: false,
      replacementEventEntityId: wrongCalendar.entityId,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    repo.calendarEvents.setException(replacement.entityId, {
      occurrenceKey: "20261107",
      cancelled: true,
    }),
  ).rejects.toThrow("recurring event");
  expect(await repo.calendarEvents.listExceptions(series.entityId)).toHaveLength(2);
});

test("event updates cannot invalidate existing recurrence exceptions", async () => {
  const repo = f.forActor(f.alice);
  const calendar = await repo.calendars.create({ name: "Work", timeZone: "UTC" });
  const base = {
    calendarEntityId: calendar.entityId,
    title: "Standup",
    timing: {
      allDay: true as const,
      startsOn: "2026-11-05",
      endsOn: "2026-11-06",
      timeZone: "UTC",
    },
  };
  const series = await repo.calendarEvents.create({ ...base, recurrenceRule: "FREQ=DAILY" });
  const replacement = await repo.calendarEvents.create(base);
  await repo.calendarEvents.setException(series.entityId, {
    occurrenceKey: "20261105",
    cancelled: false,
    replacementEventEntityId: replacement.entityId,
  });
  await expect(
    repo.calendarEvents.update(series.entityId, { recurrenceRule: null }),
  ).rejects.toThrow("exceptions");
  await expect(
    repo.calendarEvents.update(replacement.entityId, { recurrenceRule: "FREQ=DAILY" }),
  ).rejects.toThrow("replacement");
  expect((await repo.calendarEvents.get(series.entityId)).recurrenceRule).toBe("FREQ=DAILY");
  expect((await repo.calendarEvents.get(replacement.entityId)).recurrenceRule).toBeNull();
  await repo.calendarEvents.removeException(series.entityId, "20261105");
  expect(await repo.calendarEvents.listExceptions(series.entityId)).toEqual([]);
  expect(
    (await repo.calendarEvents.update(series.entityId, { recurrenceRule: null })).recurrenceRule,
  ).toBeNull();
});
