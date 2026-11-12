import { contacts, entities, entityGrants, entityLinks } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { rootEntityValues } from "./identity";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

const f = setupDatabase();

describe("database integrity", () => {
  test.each([
    "company",
    "file",
    "folder",
    "pipeline",
    "deal",
    "email_account",
    "email_conversation",
    "email_message",
    "channel",
    "thread",
    "message",
    "calendar",
    "calendar_event",
  ])("entities reject unimplemented type %s", async (type) => {
    const entityId = crypto.randomUUID();
    expect(
      await rejection(
        f.db.execute(
          sql`INSERT INTO entities (entity_id, entity_type, organization_id, access_entity_id) VALUES (${entityId}, ${type}, ${f.orgA}, ${entityId})`,
        ),
      ),
    ).toMatchObject({ cause: { code: "22P02" } });
  });

  test("entities require an organization", async () => {
    const insert = async () => {
      const entityId = crypto.randomUUID();
      await f.db.execute(
        sql`INSERT INTO entities (entity_id, entity_type, organization_id, access_entity_id) VALUES (${entityId}, 'contact', NULL, ${entityId})`,
      );
    };
    expect(await rejection(insert())).toMatchObject({ cause: { code: "23502" } });
  });
  test("typed records cannot point at the wrong entity type or organization", async () => {
    expect(
      await rejection(
        f.db
          .insert(contacts)
          .values({ entityId: f.alice, organizationId: f.orgA, displayName: "Not a contact" })
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23503" } });
    const [entity] = await f.db
      .insert(entities)
      .values(rootEntityValues(f.orgA, "contact"))
      .returning();
    expect(
      await rejection(
        f.db
          .insert(contacts)
          .values({ entityId: entity!.entityId, organizationId: f.orgB, displayName: "Wrong org" })
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23503" } });
  });

  test("raw grants and links cannot cross organization boundaries", async () => {
    const contact = await f.forActor(f.alice).contacts.create({ displayName: "A" });
    const other = await f.forActor(f.outsider, f.orgB).contacts.create({ displayName: "B" });
    expect(
      await rejection(
        f.db
          .insert(entityGrants)
          .values({
            organizationId: f.orgA,
            entityId: contact.entityId,
            actorEntityId: f.outsider,
            level: "view",
          })
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23503" } });
    expect(
      await rejection(
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
      ),
    ).toMatchObject({ cause: { code: "23503" } });
  });
});
