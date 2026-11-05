/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";

const f = setupDatabase();

test("calendar listing and updates respect permissions and validate time zones", async () => {
  const repo = f.forActor(f.alice);
  const calendar = await repo.calendars.create({ name: "Work", timeZone: "UTC" });
  expect(await f.forActor(f.bob).calendars.list()).toEqual([]);
  await repo.permissions.grant({
    entityId: calendar.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(await f.forActor(f.bob).calendars.list()).toHaveLength(1);
  await expect(
    f.forActor(f.bob).calendars.update(calendar.entityId, { name: "Denied", timeZone: "UTC" }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  const updated = await repo.calendars.update(calendar.entityId, {
    name: "Renamed",
    timeZone: "America/New_York",
  });
  expect(updated.name).toBe("Renamed");
  expect(updated.timeZone).toBe("America/New_York");
  await expect(
    repo.calendars.create({ name: "Invalid", timeZone: "not-a-time-zone" }),
  ).rejects.toThrow("time zone");
  expect(await repo.calendars.list()).toHaveLength(1);
});
