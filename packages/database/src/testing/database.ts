import { createRepositories } from "../repositories";
import * as schema from "../schema";
import { resetTestData, testDatabase } from "./connection";
import { beforeEach } from "bun:test";

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
    await testDatabase.execute(resetTestData);
    fixture.alice = crypto.randomUUID();
    fixture.bob = crypto.randomUUID();
    fixture.outsider = crypto.randomUUID();
    await testDatabase.transaction(async (tx) => {
      await tx.insert(schema.organization).values([
        { id: fixture.orgA, name: "A", slug: "a" },
        { id: fixture.orgB, name: "B", slug: "b" },
      ]);
      await tx.insert(schema.user).values([
        { id: "alice", name: "Alice", email: "alice@example.com" },
        { id: "bob", name: "Bob", email: "bob@example.com" },
        { id: "outsider", name: "Outsider", email: "outside@example.com" },
      ]);
      await tx.insert(schema.member).values([
        { id: "alice-a", userId: "alice", organizationId: fixture.orgA, role: "owner" },
        { id: "bob-a", userId: "bob", organizationId: fixture.orgA, role: "member" },
        { id: "outsider-b", userId: "outsider", organizationId: fixture.orgB, role: "owner" },
      ]);
      const actors = [
        { entityId: fixture.alice, organizationId: fixture.orgA, userId: "alice" },
        { entityId: fixture.bob, organizationId: fixture.orgA, userId: "bob" },
        { entityId: fixture.outsider, organizationId: fixture.orgB, userId: "outsider" },
      ];
      await tx.insert(schema.entities).values(
        actors.map((actor) => ({
          entityId: actor.entityId,
          organizationId: actor.organizationId,
          entityType: "actor" as const,
        })),
      );
      await tx
        .insert(schema.actors)
        .values(actors.map((actor) => ({ ...actor, type: "human" as const })));
      await tx.insert(schema.entityGrants).values(
        actors.map((actor) => ({
          entityId: actor.entityId,
          organizationId: actor.organizationId,
          actorEntityId: actor.entityId,
          level: "owner" as const,
        })),
      );
    });
  });

  return Object.assign(fixture, {
    forActor: (actorEntityId: string, organizationId = fixture.orgA) =>
      createRepositories(testDatabase).forActor({ organizationId, actorEntityId }),
  });
}
