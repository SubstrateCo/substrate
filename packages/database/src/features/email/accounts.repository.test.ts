/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";

const f = setupDatabase();

test("mailbox listing is private and edits cannot change its identity or organization", async () => {
  const repo = f.forActor(f.alice);
  const input = {
    displayName: "Work",
    emailAddress: " ALICE@EXAMPLE.COM ",
    organizationId: f.orgB,
    entityId: crypto.randomUUID(),
  };
  const account = await repo.emailAccounts.create(input);
  expect(account.organizationId).toBe(f.orgA);
  expect(account.entityId).not.toBe(input.entityId);
  expect(account.emailAddress).toBe("alice@example.com");
  expect(await f.forActor(f.bob).emailAccounts.list()).toEqual([]);
  await repo.permissions.grant({ entityId: account.entityId, actorEntityId: f.bob, level: "view" });
  expect(await f.forActor(f.bob).emailAccounts.list()).toHaveLength(1);
  await expect(
    f.forActor(f.bob).emailAccounts.update(account.entityId, { displayName: "Denied" }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  const update = {
    displayName: "Renamed",
    emailAddress: "attacker@example.com",
    organizationId: f.orgB,
  };
  const updated = await repo.emailAccounts.update(account.entityId, update);
  expect(updated.displayName).toBe("Renamed");
  expect(updated.emailAddress).toBe("alice@example.com");
  expect(updated.organizationId).toBe(f.orgA);
});
