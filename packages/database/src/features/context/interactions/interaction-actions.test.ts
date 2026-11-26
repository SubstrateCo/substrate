import { ensureUserAgentActor } from "../../../core/actors/provisioning";
import { userAgents } from "../../../core/actors/user-agents.schema";
import { member } from "../../../core/organizations/schema";
import { setupDatabase } from "../../../testing/database";
import { rejection } from "../../../testing/rejection";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

const call = (contactEntityId: string, summary: string) => ({
  contactEntityId,
  kind: "call" as const,
  summary,
  occurredAt: new Date(),
});

test("any member can correct an interaction, but only its author or an admin can delete it", async () => {
  const alice = f.forActor(f.alice);
  const bob = f.forActor(f.bob);
  const contact = await alice.contacts.createContact({ displayName: "Customer" });
  const byAlice = await alice.contactInteractions.createInteraction(
    call(contact.entityId, "Incorrect: two hundred seats"),
  );
  const byBob = await bob.contactInteractions.createInteraction(
    call(contact.entityId, "Asked for a demo"),
  );
  expect(byAlice.canDelete).toBe(true);
  expect(byBob.canDelete).toBe(true);
  expect(
    (await bob.contactInteractions.listInteractions(contact.entityId)).map((row) => [
      row.entityId,
      row.canDelete,
    ]),
  ).toEqual(
    expect.arrayContaining([
      [byAlice.entityId, false],
      [byBob.entityId, true],
    ]),
  );

  await bob.contactInteractions.updateInteraction(byAlice.entityId, {
    summary: "Corrected: twenty seats",
  });
  expect(
    await rejection(bob.contactInteractions.deleteInteraction(byAlice.entityId)),
  ).toMatchObject({ name: "AccessDeniedError" });
  expect((await bob.contactInteractions.get(byAlice.entityId)).summary).toBe(
    "Corrected: twenty seats",
  );

  await bob.contactInteractions.deleteInteraction(byBob.entityId);
  // Alice is an organization owner, so she deletes interactions she did not write.
  await alice.contactInteractions.deleteInteraction(byAlice.entityId);
  for (const id of [byAlice.entityId, byBob.entityId])
    expect(await rejection(alice.contactInteractions.get(id))).toMatchObject({
      name: "AccessDeniedError",
    });
});

test("an agent's interaction belongs to its owner for deletion", async () => {
  const [definition] = await f.db
    .insert(userAgents)
    .values({ userId: "bob", name: "Assistant", instructions: "", harness: "opencode" })
    .returning();
  const agent = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId: "bob",
    userAgentId: definition!.id,
  });
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  const contact = await f.forActor(f.alice).contacts.createContact({ displayName: "Customer" });
  const interaction = await f
    .forActor(agent.entityId)
    .contactInteractions.createInteraction(call(contact.entityId, "Agent call notes"));
  expect(
    await rejection(
      f.forActor(f.alice).contactInteractions.deleteInteraction(interaction.entityId),
    ),
  ).toMatchObject({ name: "AccessDeniedError" });
  await f.forActor(f.bob).contactInteractions.deleteInteraction(interaction.entityId);
  expect(
    await rejection(f.forActor(f.bob).contactInteractions.get(interaction.entityId)),
  ).toMatchObject({ name: "AccessDeniedError" });
});

test("an interaction on an archived contact cannot be edited until the contact is restored", async () => {
  const alice = f.forActor(f.alice);
  const contact = await alice.contacts.createContact({ displayName: "Former customer" });
  const interaction = await alice.contactInteractions.createInteraction(
    call(contact.entityId, "Original notes"),
  );
  await alice.contacts.archive(contact.entityId, true);
  expect(
    await rejection(
      alice.contactInteractions.updateInteraction(interaction.entityId, { summary: "Changed" }),
    ),
  ).toMatchObject({ name: "ValidationError" });
  expect((await alice.contactInteractions.get(interaction.entityId)).summary).toBe(
    "Original notes",
  );
  await alice.contacts.archive(contact.entityId, false);
  await alice.contactInteractions.updateInteraction(interaction.entityId, { summary: "Changed" });
});
