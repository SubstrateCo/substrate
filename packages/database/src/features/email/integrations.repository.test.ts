/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { AccessDeniedError, ConflictError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { emailIntegrations } from "./integrations.schema";

const f = setupDatabase();

async function connectedAccount() {
  const repo = f.forActor(f.alice);
  const account = await repo.emailAccounts.create({
    displayName: "Work",
    emailAddress: "alice@example.com",
  });
  const integration = await repo.emailIntegrations.connect({
    emailAccountEntityId: account.entityId,
    provider: "google",
    externalAccountId: "google-alice",
    externalResourceId: "mailbox",
    credentialReference: "vault/email/alice",
  });
  return { repo, account, integration };
}

test("email integration management is owner-only and scoped to its mailbox", async () => {
  const { repo, account, integration } = await connectedAccount();
  expect(integration.organizationId).toBe(f.orgA);
  expect(integration.connectedByActorEntityId).toBe(f.alice);
  expect((await repo.emailIntegrations.get(account.entityId)).credentialReference).toBe(
    "vault/email/alice",
  );
  for (const level of ["view", "edit"] as const) {
    await repo.permissions.grant({ entityId: account.entityId, actorEntityId: f.bob, level });
    await expect(f.forActor(f.bob).emailIntegrations.get(account.entityId)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    await expect(
      f.forActor(f.bob).emailIntegrations.claimSync(account.entityId),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      f.forActor(f.bob).emailIntegrations.disconnect(account.entityId),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  }
  await expect(
    f.forActor(f.outsider, f.orgB).emailIntegrations.get(account.entityId),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  const other = await repo.emailAccounts.create({
    displayName: "Other",
    emailAddress: "other@example.com",
  });
  await expect(
    repo.emailIntegrations.connect({
      emailAccountEntityId: other.entityId,
      provider: "google",
      externalAccountId: "google-alice",
      externalResourceId: "mailbox",
      credentialReference: "vault/email/alice",
    }),
  ).rejects.toMatchObject({ cause: { code: "23505" } });
});

test("concurrent email workers cannot claim the same integration", async () => {
  const { repo, account } = await connectedAccount();
  const results = await Promise.allSettled([
    repo.emailIntegrations.claimSync(account.entityId),
    repo.emailIntegrations.claimSync(account.entityId),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  const result = results.find((result) => result.status === "fulfilled");
  if (result?.status !== "fulfilled") throw new Error("Expected a claimed lease.");
  await repo.emailIntegrations.completeSync(account.entityId, {
    leaseToken: result.value.leaseToken,
    cursor: "cursor-1",
  });
  const successful = await repo.emailIntegrations.get(account.entityId);
  expect(successful.syncCursor).toBe("cursor-1");
  expect(successful.lastSyncedAt).not.toBeNull();
  expect(successful.lastSyncAttemptAt).not.toBeNull();
  const next = await repo.emailIntegrations.claimSync(account.entityId);
  await repo.emailIntegrations.failSync(account.entityId, {
    leaseToken: next.leaseToken,
    error: "Provider unavailable",
  });
  const failed = await repo.emailIntegrations.get(account.entityId);
  expect(failed.syncCursor).toBe("cursor-1");
  expect(failed.lastSyncedAt).toEqual(successful.lastSyncedAt);
  expect(failed.lastSyncError).toBe("Provider unavailable");
  expect(failed.syncLeaseToken).toBeNull();
});

test("expired email workers cannot overwrite a newer cursor, and pausing cancels leases", async () => {
  const { repo, account } = await connectedAccount();
  const old = await repo.emailIntegrations.claimSync(account.entityId);
  await f.db
    .update(emailIntegrations)
    .set({ syncLeaseExpiresAt: sql`clock_timestamp() - interval '1 second'` })
    .where(eq(emailIntegrations.emailAccountEntityId, account.entityId));
  const next = await repo.emailIntegrations.claimSync(account.entityId);
  await expect(
    repo.emailIntegrations.completeSync(account.entityId, {
      leaseToken: old.leaseToken,
      cursor: "stale",
    }),
  ).rejects.toBeInstanceOf(ConflictError);
  await repo.emailIntegrations.completeSync(account.entityId, {
    leaseToken: next.leaseToken,
    cursor: "current",
  });
  const interrupted = await repo.emailIntegrations.claimSync(account.entityId);
  await repo.emailIntegrations.pause(account.entityId);
  await expect(
    repo.emailIntegrations.completeSync(account.entityId, {
      leaseToken: interrupted.leaseToken,
      cursor: "stale",
    }),
  ).rejects.toBeInstanceOf(ConflictError);
  await expect(repo.emailIntegrations.claimSync(account.entityId)).rejects.toBeInstanceOf(
    ConflictError,
  );
  await repo.emailIntegrations.resume(account.entityId);
  expect((await repo.emailIntegrations.claimSync(account.entityId)).cursor).toBe("current");
  await repo.emailIntegrations.disconnect(account.entityId);
  await expect(repo.emailIntegrations.get(account.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  expect((await repo.emailAccounts.get(account.entityId)).displayName).toBe("Work");
});

test("email content and sync cursor updates share the caller's transaction", async () => {
  const { repo, account } = await connectedAccount();
  const lease = await repo.emailIntegrations.claimSync(account.entityId);
  await expect(
    repo.transaction(async (tx) => {
      const conversation = await tx.emailConversations.create({
        emailAccountEntityId: account.entityId,
        subject: "Imported",
      });
      await tx.emailMessages.create({
        conversationEntityId: conversation.entityId,
        direction: "inbound",
        providerMessageId: "provider-message-1",
      });
      await tx.emailIntegrations.completeSync(account.entityId, {
        leaseToken: lease.leaseToken,
        cursor: "cursor-1",
      });
      throw new Error("abort");
    }),
  ).rejects.toThrow("abort");
  expect(await repo.emailConversations.list(account.entityId)).toEqual([]);
  const integration = await repo.emailIntegrations.get(account.entityId);
  expect(integration.syncCursor).toBeNull();
  expect(integration.syncLeaseToken).toBe(lease.leaseToken);
});
