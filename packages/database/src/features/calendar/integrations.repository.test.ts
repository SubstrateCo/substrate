/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { AccessDeniedError, ConflictError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { calendarIntegrations } from "./integrations.schema";

const f = setupDatabase();

async function connectedCalendar() {
  const repo = f.forActor(f.alice);
  const calendar = await repo.calendars.create({ name: "Work", timeZone: "UTC" });
  await repo.calendarIntegrations.connect({
    calendarEntityId: calendar.entityId,
    provider: "google",
    externalAccountId: "google-alice",
    externalResourceId: "work",
    credentialReference: "vault/calendar/alice",
  });
  return { repo, calendar };
}

test("calendar connections share a credential reference but keep independent sync cursors", async () => {
  const { repo, calendar } = await connectedCalendar();
  const second = await repo.calendars.create({ name: "Personal", timeZone: "UTC" });
  await repo.calendarIntegrations.connect({
    calendarEntityId: second.entityId,
    provider: "google",
    externalAccountId: "google-alice",
    externalResourceId: "personal",
    credentialReference: "vault/calendar/alice",
  });
  const lease = await repo.calendarIntegrations.claimSync(calendar.entityId);
  await repo.calendarIntegrations.completeSync(calendar.entityId, {
    leaseToken: lease.leaseToken,
    cursor: "work-cursor",
  });
  expect((await repo.calendarIntegrations.get(second.entityId)).syncCursor).toBeNull();
  expect((await repo.calendarIntegrations.get(second.entityId)).credentialReference).toBe(
    "vault/calendar/alice",
  );
  const duplicate = await repo.calendars.create({ name: "Duplicate", timeZone: "UTC" });
  await expect(
    repo.calendarIntegrations.connect({
      calendarEntityId: duplicate.entityId,
      provider: "google",
      externalAccountId: "google-alice",
      externalResourceId: "work",
      credentialReference: "vault/calendar/alice",
    }),
  ).rejects.toMatchObject({ cause: { code: "23505" } });
});

test("calendar integration management does not follow view or edit access", async () => {
  const { repo, calendar } = await connectedCalendar();
  for (const level of ["view", "edit"] as const) {
    await repo.permissions.grant({ entityId: calendar.entityId, actorEntityId: f.bob, level });
    await expect(
      f.forActor(f.bob).calendarIntegrations.get(calendar.entityId),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      f.forActor(f.bob).calendarIntegrations.claimSync(calendar.entityId),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      f.forActor(f.bob).calendarIntegrations.disconnect(calendar.entityId),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  }
  await expect(
    f.forActor(f.outsider, f.orgB).calendarIntegrations.pause(calendar.entityId),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});

test("calendar sync leases reject concurrent and expired workers", async () => {
  const { repo, calendar } = await connectedCalendar();
  const results = await Promise.allSettled([
    repo.calendarIntegrations.claimSync(calendar.entityId),
    repo.calendarIntegrations.claimSync(calendar.entityId),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  const claimed = results.find((result) => result.status === "fulfilled");
  if (claimed?.status !== "fulfilled") throw new Error("Expected a claimed lease.");
  await f.db
    .update(calendarIntegrations)
    .set({ syncLeaseExpiresAt: sql`clock_timestamp() - interval '1 second'` })
    .where(eq(calendarIntegrations.calendarEntityId, calendar.entityId));
  await expect(
    repo.calendarIntegrations.completeSync(calendar.entityId, {
      leaseToken: claimed.value.leaseToken,
      cursor: "expired",
    }),
  ).rejects.toBeInstanceOf(ConflictError);
  const next = await repo.calendarIntegrations.claimSync(calendar.entityId);
  await expect(
    repo.calendarIntegrations.failSync(calendar.entityId, {
      leaseToken: claimed.value.leaseToken,
      error: "Old worker",
    }),
  ).rejects.toBeInstanceOf(ConflictError);
  await repo.calendarIntegrations.completeSync(calendar.entityId, {
    leaseToken: next.leaseToken,
    cursor: "current",
  });
  const failed = await repo.calendarIntegrations.claimSync(calendar.entityId);
  await repo.calendarIntegrations.failSync(calendar.entityId, {
    leaseToken: failed.leaseToken,
    error: "Provider unavailable",
  });
  const integration = await repo.calendarIntegrations.get(calendar.entityId);
  expect(integration.syncCursor).toBe("current");
  expect(integration.lastSyncError).toBe("Provider unavailable");
  expect(integration.lastSyncedAt).not.toBeNull();
});

test("pausing calendar sync cancels workers; disconnect preserves calendar data", async () => {
  const { repo, calendar } = await connectedCalendar();
  const lease = await repo.calendarIntegrations.claimSync(calendar.entityId);
  await repo.calendarIntegrations.pause(calendar.entityId);
  await expect(
    repo.calendarIntegrations.completeSync(calendar.entityId, {
      leaseToken: lease.leaseToken,
      cursor: "stale",
    }),
  ).rejects.toBeInstanceOf(ConflictError);
  await expect(repo.calendarIntegrations.claimSync(calendar.entityId)).rejects.toBeInstanceOf(
    ConflictError,
  );
  await repo.calendarIntegrations.resume(calendar.entityId);
  expect((await repo.calendarIntegrations.claimSync(calendar.entityId)).cursor).toBeNull();
  await repo.calendarIntegrations.disconnect(calendar.entityId);
  await expect(repo.calendarIntegrations.get(calendar.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  expect((await repo.calendars.get(calendar.entityId)).name).toBe("Work");
});
