import { AccessDeniedError, ValidationError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { ensureUserAgentActor } from "../actors/provisioning";
import { userAgents } from "../actors/user-agents.schema";
import { entities } from "../entities/schema";
import { member } from "../organizations/schema";
import { RepositoryContext } from "../repository-context";
import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";

const f = setupDatabase();

const context = (actorEntityId: string, organizationId = f.orgA) =>
  new RepositoryContext(f.db, { organizationId, actorEntityId });

async function promote(userId: string, role: string) {
  await f.db.update(member).set({ role }).where(eq(member.userId, userId));
}

test("organization admins and owners act as owner of unshared records", async () => {
  const account = await f.forActor(f.bob).crm.createAccount({ name: "Bob's account" });
  expect(
    await rejection(context(f.outsider, f.orgB).requireAccess(account.entityId, "view")),
  ).toBeInstanceOf(AccessDeniedError);
  expect((await context(f.alice).requireAccess(account.entityId, "owner")).level).toBe("owner");
  await promote("alice", "member");
  expect(await rejection(context(f.alice).requireAccess(account.entityId, "view"))).toBeInstanceOf(
    AccessDeniedError,
  );
  await promote("alice", "member,admin");
  expect((await context(f.alice).requireAccess(account.entityId, "owner")).level).toBe("owner");
});

test("every member edits an organization's contacts without grants, and outsiders cannot read them", async () => {
  const contact = await f.forActor(f.alice).contacts.create({ displayName: "Shared" });
  const bob = f.forActor(f.bob);
  expect((await bob.contacts.get(contact.entityId)).displayName).toBe("Shared");
  expect((await bob.contacts.update(contact.entityId, { displayName: "Edited" })).displayName).toBe(
    "Edited",
  );
  expect(
    await rejection(f.forActor(f.outsider, f.orgB).contacts.get(contact.entityId)),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(
      f.forActor(f.alice).permissions.grant({
        entityId: contact.entityId,
        actorEntityId: f.bob,
        level: "view",
      }),
    ),
  ).toBeInstanceOf(ValidationError);
  expect(await f.accessLevel(f.bob, contact.entityId)).toBe("edit");
});

test("admin access is limited to the admin's organization", async () => {
  const contact = await f.forActor(f.alice).contacts.create({ displayName: "Org A" });
  expect(
    await rejection(context(f.outsider, f.orgB).requireAccess(contact.entityId, "view")),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(context(f.outsider, f.orgA).requireAccess(contact.entityId, "view")),
  ).toBeInstanceOf(AccessDeniedError);
});

test("admins do not gain owner access to other people's actor records", async () => {
  expect(await rejection(context(f.alice).requireAccess(f.bob, "owner"))).toBeInstanceOf(
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
  const account = await f.forActor(f.bob).crm.createAccount({ name: "Bob's account" });
  expect((await context(actor.entityId).requireAccess(account.entityId, "edit")).level).toBe(
    "owner",
  );
  await promote("alice", "member");
  expect(
    await rejection(context(actor.entityId).requireAccess(account.entityId, "view")),
  ).toBeInstanceOf(AccessDeniedError);
});

test("admins inherit owner access from a shared container, not from the child's own type", async () => {
  const bob = context(f.bob);
  const project = await bob.createEntity("project");
  const [inProject, inActor] = await f.db
    .insert(entities)
    .values([
      { organizationId: f.orgA, entityType: "actor", accessEntityId: project.entityId },
      { organizationId: f.orgA, entityType: "task", accessEntityId: f.bob },
    ])
    .returning();
  const alice = context(f.alice);
  expect((await alice.requireAccess(inProject!.entityId, "owner")).level).toBe("owner");
  expect(await rejection(alice.requireAccess(inActor!.entityId, "view"))).toBeInstanceOf(
    AccessDeniedError,
  );
  const readable = await f.db
    .select({ id: entities.entityId })
    .from(entities)
    .where(
      and(
        inArray(entities.entityId, [inProject!.entityId, inActor!.entityId]),
        alice.readable(entities.entityId),
      ),
    );
  expect(readable.map((row) => row.id)).toEqual([inProject!.entityId]);
});

test("readable entities include unshared records for admins only", async () => {
  const account = await f.forActor(f.bob).crm.createAccount({ name: "Bob's account" });
  const ids = async () => (await f.forActor(f.alice).crm.listAccounts()).map((row) => row.entityId);
  expect(await ids()).toEqual([account.entityId]);
  await promote("alice", "member");
  expect(await ids()).toEqual([]);
});
