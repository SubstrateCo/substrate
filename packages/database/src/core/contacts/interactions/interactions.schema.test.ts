import { setupDatabase } from "../../../testing/database";
import { rejection } from "../../../testing/rejection";
import { entities } from "../../entities/schema";
import { contactInteractions } from "./interactions.schema";
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

describe("contact interaction constraints", () => {
  test("rejects mismatched organizations, actors, and access containers", async () => {
    const repo = f.forActor(f.alice);
    const contact = await repo.contacts.create({ displayName: "Jane" });
    const other = await repo.contacts.create({ displayName: "Other" });
    const entry = await repo.contactInteractions.createManual({
      contactEntityId: contact.entityId,
      kind: "note",
      occurredAt: new Date(),
      summary: "Note",
    });
    const where = eq(contactInteractions.entityId, entry.entityId);
    for (const change of [
      { organizationId: f.orgB },
      { contactEntityId: other.entityId },
      { createdByActorEntityId: f.outsider },
    ]) {
      expect(
        await rejection(f.db.update(contactInteractions).set(change).where(where)),
      ).toMatchObject({ cause: { code: "23503" } });
    }
    expect(
      await rejection(
        f.db
          .update(entities)
          .set({ accessEntityId: other.entityId })
          .where(eq(entities.entityId, entry.entityId)),
      ),
    ).toMatchObject({ cause: { code: "23503" } });
  });

  test("requires valid times, summaries, and entity type", async () => {
    const repo = f.forActor(f.alice);
    const contact = await repo.contacts.create({ displayName: "Jane" });
    const entry = await repo.contactInteractions.createManual({
      contactEntityId: contact.entityId,
      kind: "note",
      occurredAt: new Date("2026-01-02"),
      summary: "Note",
    });
    for (const change of [
      { summary: "  " },
      { endedAt: new Date("2026-01-01") },
      { entityType: "contact" as const },
    ]) {
      const error = await rejection(
        f.db
          .update(contactInteractions)
          .set(change)
          .where(eq(contactInteractions.entityId, entry.entityId)),
      );
      expect(error).toMatchObject({ cause: { code: "23514" } });
    }
  });
});
