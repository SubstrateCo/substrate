import { contacts, entities, entityGrants, entityLinks } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { rootEntityValues } from "./identity";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

const f = setupDatabase();

describe("database integrity", () => {
  test("entities require an organization", async () => {
    const insert = async () => {
      const entityId = crypto.randomUUID();
      await f.db.execute(
        sql`INSERT INTO entities (entity_id, entity_type, organization_id, access_entity_id) VALUES (${entityId}, 'contact', NULL, ${entityId})`,
      );
    };
    await expect(insert()).rejects.toMatchObject({ cause: { code: "23502" } });
  });
  test("typed records cannot point at the wrong entity type or organization", async () => {
    await expect(
      f.db
        .insert(contacts)
        .values({ entityId: f.alice, organizationId: f.orgA, displayName: "Not a contact" })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    const [entity] = await f.db
      .insert(entities)
      .values(rootEntityValues(f.orgA, "contact"))
      .returning();
    await expect(
      f.db
        .insert(contacts)
        .values({ entityId: entity!.entityId, organizationId: f.orgB, displayName: "Wrong org" })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  test("raw grants and links cannot cross organization boundaries", async () => {
    const contact = await f.forActor(f.alice).contacts.create({ displayName: "A" });
    const other = await f.forActor(f.outsider, f.orgB).contacts.create({ displayName: "B" });
    await expect(
      f.db
        .insert(entityGrants)
        .values({
          organizationId: f.orgA,
          entityId: contact.entityId,
          actorEntityId: f.outsider,
          level: "view",
        })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(
      f.db
        .insert(entityLinks)
        .values({
          organizationId: f.orgA,
          sourceEntityId: contact.entityId,
          targetEntityId: other.entityId,
          relationType: "related_to",
          createdByActorEntityId: f.alice,
        })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });
});
