import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { entities } from "../entities/schema";
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

describe("contact interactions", () => {
  test("inherits contact access and hides history when the contact is deleted", async () => {
    const repo = f.forActor(f.bob);
    const contact = await repo.contacts.create({ displayName: "Jane" });
    const interaction = await repo.contactInteractions.createManual({
      contactEntityId: contact.entityId,
      kind: "call",
      occurredAt: new Date(),
      summary: "Discussed the proposal",
    });
    expect(await repo.contactInteractions.listForContact(contact.entityId)).toHaveLength(1);
    await rejection(f.forActor(f.outsider, f.orgB).contactInteractions.get(interaction.entityId));
    await repo.entities.softDelete(contact.entityId);
    await rejection(repo.contactInteractions.get(interaction.entityId));
    await rejection(repo.contactInteractions.listForContact(contact.entityId));
  });

  test("rejects invalid times and rolls back interaction entities", async () => {
    const repo = f.forActor(f.alice);
    const contact = await repo.contacts.create({ displayName: "Jane" });
    const before = await f.db
      .select()
      .from(entities)
      .where(eq(entities.entityType, "contact_interaction"));
    await rejection(
      repo.contactInteractions.createManual({
        contactEntityId: contact.entityId,
        kind: "meeting",
        occurredAt: new Date("2026-01-02"),
        endedAt: new Date("2026-01-01"),
        summary: "Invalid",
      }),
    );
    expect(
      await f.db.select().from(entities).where(eq(entities.entityType, "contact_interaction")),
    ).toHaveLength(before.length);
  });

  test("paginates equal timestamps without duplicates and rolls back with its caller", async () => {
    const repo = f.forActor(f.alice);
    const contact = await repo.contacts.create({ displayName: "Jane" });
    const input = {
      contactEntityId: contact.entityId,
      kind: "call" as const,
      occurredAt: new Date(),
      summary: "Call",
    };
    await repo.contactInteractions.createManual(input);
    await repo.contactInteractions.createManual(input);
    const first = await repo.contactInteractions.listForContact(contact.entityId, { limit: 1 });
    const next = await repo.contactInteractions.listForContact(contact.entityId, {
      limit: 1,
      before: { occurredAt: first[0]!.occurredAt, entityId: first[0]!.entityId },
    });
    expect(next).toHaveLength(1);
    expect(next[0]!.entityId).not.toBe(first[0]!.entityId);
    await rejection(
      repo.transaction(async (tx) => {
        await tx.contactInteractions.createManual(input);
        throw new Error("rollback");
      }),
    );
    expect(await repo.contactInteractions.listForContact(contact.entityId)).toHaveLength(2);
  });
});
