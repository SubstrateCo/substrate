import { realtimeKeys } from "@substrate/contracts/realtime";

import { ensureHumanActor } from "../../core/actors/provisioning";
import { user } from "../../core/authentication/schema";
import { commit } from "../../core/effects";
import { member } from "../../core/organizations/schema";
import { RepositoryContext } from "../../core/repository-context";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { notify } from "./effects";
import { notifications } from "./schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("grouped entity alerts use one access-checked read and one insert, and the first group wins", async () => {
  await f.db.insert(user).values({ id: "one", name: "one", email: "one@example.com" });
  await f.db.insert(member).values({ id: "one-a", userId: "one", organizationId: f.orgA });
  await f.db.update(user).set({ emailVerified: true });
  const one = await ensureHumanActor(f.db, { userId: "one", organizationId: f.orgA });
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Alerts" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Alert" });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const { db, queries } = recordQueries();
  const eventKey = crypto.randomUUID();
  const { result, hints } = await commit(db, (tx) =>
    notify(
      new RepositoryContext(tx, { organizationId: f.orgA, actorEntityId: f.alice }),
      [
        // Entity targets reach recipients only by actor, so this group names nobody.
        { kind: "reply", recipients: [{ userId: "bob" }] },
        { kind: "mention", recipients: [{ actorEntityId: f.bob }] },
        {
          kind: "assignment",
          recipients: [
            { actorEntityId: f.bob },
            { actorEntityId: f.alice },
            { actorEntityId: one.entityId },
          ],
        },
      ],
      { entityId: task.entityId, eventKey },
    ),
  );
  expect(queries.filter((query) => /^\s*select/i.test(query))).toHaveLength(1);
  expect(queries.filter((query) => /^\s*insert into "notifications"/i.test(query))).toHaveLength(1);
  // Bob reads through his grant and Alice as the organization owner; One has no access.
  expect(
    (await f.db.select().from(notifications).where(eq(notifications.eventKey, eventKey)))
      .map((row) => `${row.recipientActorEntityId}:${row.kind}`)
      .sort((a, b) => a.localeCompare(b)),
  ).toEqual([`${f.alice}:assignment`, `${f.bob}:mention`].sort());
  expect(result.map((row) => row.actorId).sort((a, b) => a.localeCompare(b))).toEqual(
    [f.alice, f.bob].sort(),
  );
  expect(
    hints
      .filter((hint) => hint.domain === "notifications")
      .map((hint) => hint.audience)
      .sort((a, b) => String(a).localeCompare(String(b))),
  ).toEqual(
    [realtimeKeys.actor(f.orgA, f.alice), realtimeKeys.actor(f.orgA, f.bob)].sort((a, b) =>
      String(a).localeCompare(String(b)),
    ),
  );
});
