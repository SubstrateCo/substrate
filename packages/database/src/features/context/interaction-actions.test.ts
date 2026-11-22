import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";

const f = setupDatabase();

test("a contact editor can correct an interaction, but only its owner can delete it", async () => {
  const alice = f.forActor(f.alice);
  const contact = await alice.contacts.createContact({ displayName: "Customer" });
  await alice.crm.share(contact.entityId, f.bob, "edit");
  const interaction = await alice.contactInteractions.createInteraction({
    contactEntityId: contact.entityId,
    kind: "call",
    summary: "Incorrect: two hundred seats",
    occurredAt: new Date(),
  });
  const bob = f.forActor(f.bob);
  await bob.contactInteractions.updateInteraction(interaction.entityId, {
    summary: "Corrected: twenty seats",
  });
  expect(
    await rejection(bob.contactInteractions.deleteInteraction(interaction.entityId)),
  ).toMatchObject({ name: "AccessDeniedError" });
  expect((await bob.contactInteractions.get(interaction.entityId)).summary).toBe(
    "Corrected: twenty seats",
  );
  await alice.contactInteractions.deleteInteraction(interaction.entityId);
  expect(await rejection(alice.contactInteractions.get(interaction.entityId))).toMatchObject({
    name: "AccessDeniedError",
  });
});
