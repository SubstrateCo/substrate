import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { ensureUserAgentActor } from "../actors/provisioning";
import { userAgents } from "../actors/user-agents.schema";
import { member } from "../organizations/schema";
import { RepositoryContext } from "../repository-context";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

const context = (actorEntityId: string, organizationId = f.orgA) =>
  new RepositoryContext(f.db, { organizationId, actorEntityId });

async function promote(userId: string, role: string) {
  await f.db.update(member).set({ role }).where(eq(member.userId, userId));
}

test("organization admins and owners act as owner of unshared records", async () => {
  const contact = await f.forActor(f.bob).contacts.create({ displayName: "Bob's contact" });
  await expect(
    context(f.outsider, f.orgB).requireAccess(contact.entityId, "view"),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  expect((await context(f.alice).requireAccess(contact.entityId, "owner")).level).toBe("owner");
  await promote("alice", "member");
  await expect(context(f.alice).requireAccess(contact.entityId, "view")).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await promote("alice", "member,admin");
  expect((await context(f.alice).requireAccess(contact.entityId, "owner")).level).toBe("owner");
});

test("admin access is limited to the admin's organization", async () => {
  const contact = await f.forActor(f.alice).contacts.create({ displayName: "Org A" });
  await expect(
    context(f.outsider, f.orgB).requireAccess(contact.entityId, "view"),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(
    context(f.outsider, f.orgA).requireAccess(contact.entityId, "view"),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});

test("admins do not gain owner access to other people's actor records", async () => {
  await expect(context(f.alice).requireAccess(f.bob, "owner")).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});

test("an admin's agent acts with the admin's live access", async () => {
  const [agent] = await f.db
    .insert(userAgents)
    .values({ userId: "alice", name: "Assistant", instructions: "", harness: "opencode" })
    .returning();
  const actor = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    userAgentId: agent!.id,
  });
  const contact = await f.forActor(f.bob).contacts.create({ displayName: "Bob's contact" });
  expect((await context(actor.entityId).requireAccess(contact.entityId, "edit")).level).toBe(
    "owner",
  );
  await promote("alice", "member");
  await expect(
    context(actor.entityId).requireAccess(contact.entityId, "view"),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});

test("readable entities include unshared records for admins only", async () => {
  const contact = await f.forActor(f.bob).contacts.create({ displayName: "Bob's contact" });
  const ids = async () => (await f.forActor(f.alice).contacts.list()).map((row) => row.entityId);
  expect(await ids()).toEqual([contact.entityId]);
  await promote("alice", "member");
  expect(await ids()).toEqual([]);
});
