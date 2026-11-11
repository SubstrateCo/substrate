import { RepositoryContext } from "../core/repository-context";
import { createRepositories } from "../repositories";
import * as schema from "../schema";
import { resetTestData, testDatabase } from "./connection";
import { beforeEach } from "bun:test";
import { sql } from "drizzle-orm";

export function setupDatabase() {
  const fixture = {
    db: testDatabase,
    orgA: "org-a",
    orgB: "org-b",
    alice: "",
    bob: "",
    outsider: "",
  };

  beforeEach(async () => {
    await resetTestData();
    fixture.alice = crypto.randomUUID();
    fixture.bob = crypto.randomUUID();
    fixture.outsider = crypto.randomUUID();
    const actors = [
      { entityId: fixture.alice, organizationId: fixture.orgA, userId: "alice" },
      { entityId: fixture.bob, organizationId: fixture.orgA, userId: "bob" },
      { entityId: fixture.outsider, organizationId: fixture.orgB, userId: "outsider" },
    ];
    // One statement saves round trips. Foreign keys are checked when the whole statement ends.
    const inserts = [
      testDatabase.insert(schema.organization).values([
        { id: fixture.orgA, name: "A", slug: "a" },
        { id: fixture.orgB, name: "B", slug: "b" },
      ]),
      testDatabase.insert(schema.user).values([
        { id: "alice", name: "Alice", email: "alice@example.com" },
        { id: "bob", name: "Bob", email: "bob@example.com" },
        { id: "outsider", name: "Outsider", email: "outside@example.com" },
      ]),
      testDatabase.insert(schema.member).values([
        { id: "alice-a", userId: "alice", organizationId: fixture.orgA, role: "owner" },
        { id: "bob-a", userId: "bob", organizationId: fixture.orgA, role: "member" },
        { id: "outsider-b", userId: "outsider", organizationId: fixture.orgB, role: "owner" },
      ]),
      testDatabase.insert(schema.entities).values(
        actors.map((actor) => ({
          entityId: actor.entityId,
          organizationId: actor.organizationId,
          entityType: "actor" as const,
        })),
      ),
      testDatabase
        .insert(schema.actors)
        .values(actors.map((actor) => ({ ...actor, type: "human" as const }))),
    ];
    const grants = testDatabase.insert(schema.entityGrants).values(
      actors.map((actor) => ({
        entityId: actor.entityId,
        organizationId: actor.organizationId,
        actorEntityId: actor.entityId,
        level: "owner" as const,
      })),
    );
    await testDatabase.execute(
      sql`WITH ${sql.join(
        inserts.map(
          (insert, index) => sql`${sql.identifier(`fixture_${index}`)} AS (${insert.getSQL()})`,
        ),
        sql`, `,
      )} ${grants.getSQL()}`,
    );
  });

  return Object.assign(fixture, {
    forActor: (actorEntityId: string, organizationId = fixture.orgA) =>
      createRepositories(testDatabase).forActor({ organizationId, actorEntityId }),
    /** The actor's level on the entity, through the access check that repositories use. */
    accessLevel: async (actorEntityId: string, entityId: string) =>
      (
        await new RepositoryContext(testDatabase, {
          organizationId: fixture.orgA,
          actorEntityId,
        }).requireAccess(entityId, "view")
      ).level,
  });
}
