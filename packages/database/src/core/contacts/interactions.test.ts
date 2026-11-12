import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { entities } from "../entities/schema";
import { contactInteractions } from "./interactions.schema";
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

  test("publishes a source-backed summary without exposing its private source reference", async () => {
    const alice = f.forActor(f.alice);
    const bob = f.forActor(f.bob);
    const contact = await bob.contacts.create({ displayName: "Jane" });
    await bob.permissions.grant({
      entityId: contact.entityId,
      actorEntityId: f.alice,
      level: "edit",
    });
    const source = await alice.contacts.create({ displayName: "Private source" });
    const input = {
      contactEntityId: contact.entityId,
      kind: "note" as const,
      occurredAt: new Date(),
      summary: "Approved public summary",
      sourceEntityId: source.entityId,
    };
    const entry = await alice.contactInteractions.publishFromSource(input);
    expect(
      (await alice.contactInteractions.listForSource(source.entityId)).map((row) => row.entityId),
    ).toEqual([entry.entityId]);
    await rejection(bob.contactInteractions.listForSource(source.entityId));
    const retry = await alice.contactInteractions.publishFromSource({
      ...input,
      summary: "Must not overwrite",
    });
    expect(retry.entityId).toBe(entry.entityId);
    const published = await bob.contactInteractions.get(entry.entityId);
    expect(published).toMatchObject({
      summary: input.summary,
      source: null,
    });
    expect(published).not.toHaveProperty("sourceEntityId");
    expect(published).not.toHaveProperty("sourceEntityType");
    expect((await alice.contactInteractions.get(entry.entityId)).source).toMatchObject({
      entityId: source.entityId,
      entityType: "contact",
    });
    await alice.entities.softDelete(source.entityId);
    expect((await bob.contactInteractions.get(entry.entityId)).summary).toBe(input.summary);
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

  test("concurrent publication creates one entry and preserves summary edits", async () => {
    const repo = f.forActor(f.alice);
    const contact = await repo.contacts.create({ displayName: "Jane" });
    const source = await repo.contacts.create({ displayName: "Source" });
    const input = {
      contactEntityId: contact.entityId,
      kind: "note" as const,
      occurredAt: new Date(),
      summary: "Published",
      sourceEntityId: source.entityId,
    };
    const rows = await Promise.all([
      repo.contactInteractions.publishFromSource(input),
      repo.contactInteractions.publishFromSource(input),
    ]);
    expect(rows[0]!.entityId).toBe(rows[1]!.entityId);
    expect(
      await f.db.select().from(entities).where(eq(entities.entityType, "contact_interaction")),
    ).toHaveLength(1);
    await repo.contactInteractions.update(rows[0]!.entityId, { summary: "Edited" });
    expect((await repo.contactInteractions.publishFromSource(input)).summary).toBe("Edited");
    await repo.contactInteractions.softDelete(rows[0]!.entityId);
    await rejection(repo.contactInteractions.publishFromSource(input));
    expect(await repo.contactInteractions.listForContact(contact.entityId)).toEqual([]);
  });

  test("checks source access and contact edit permission before publication", async () => {
    const alice = f.forActor(f.alice);
    const bob = f.forActor(f.bob);
    const contact = await alice.contacts.create({ displayName: "Jane" });
    const source = await alice.contacts.create({ displayName: "Source" });
    const input = {
      contactEntityId: contact.entityId,
      kind: "note" as const,
      occurredAt: new Date(),
      summary: "Published",
      sourceEntityId: source.entityId,
    };
    await alice.permissions.grant({
      entityId: contact.entityId,
      actorEntityId: f.bob,
      level: "edit",
    });
    await rejection(bob.contactInteractions.publishFromSource(input));
    await alice.permissions.grant({
      entityId: source.entityId,
      actorEntityId: f.bob,
      level: "view",
    });
    await alice.permissions.grant({
      entityId: contact.entityId,
      actorEntityId: f.bob,
      level: "view",
    });
    await rejection(bob.contactInteractions.publishFromSource(input));
    const outside = await f
      .forActor(f.outsider, f.orgB)
      .contacts.create({ displayName: "Outside" });
    await rejection(
      alice.contactInteractions.publishFromSource({ ...input, sourceEntityId: outside.entityId }),
    );
    expect(await f.db.select().from(contactInteractions)).toEqual([]);
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
