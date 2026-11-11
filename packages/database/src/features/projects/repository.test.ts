import { entities } from "../../core/entities/schema";
import { AccessDeniedError, ValidationError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { projects } from "./schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("projects whitelist fields and reject blank names without orphan entities", async () => {
  const alice = f.forActor(f.alice);
  const input = {
    name: "  Launch  ",
    organizationId: f.orgB,
    entityId: f.outsider,
    entityType: "task",
  };
  const project = await alice.projects.create(input);
  expect(project).toMatchObject({ organizationId: f.orgA, entityType: "project", name: "Launch" });
  expect(project.entityId).not.toBe(f.outsider);
  const before = await f.db.select().from(entities);
  expect(await rejection(alice.projects.create({ name: " " }))).toBeInstanceOf(ValidationError);
  expect(await f.db.select().from(entities)).toHaveLength(before.length);
  const update = {
    name: "Renamed",
    description: "New scope",
    organizationId: f.orgB,
    entityId: f.outsider,
  };
  expect(await alice.projects.update(project.entityId, update)).toMatchObject({
    entityId: project.entityId,
    organizationId: f.orgA,
    name: "Renamed",
    description: "New scope",
  });
});

test("project editors can update projects but viewers and organization admins have no implicit edit access", async () => {
  const alice = f.forActor(f.alice);
  const bob = f.forActor(f.bob);
  const project = await alice.projects.create({ name: "Private" });
  expect(await rejection(bob.projects.get(project.entityId))).toBeInstanceOf(AccessDeniedError);
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(
    await rejection(
      bob.projects.update(project.entityId, { name: "Not allowed", description: "" }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  expect(
    await bob.projects.update(project.entityId, { name: "Renamed", description: "Review" }),
  ).toMatchObject({ name: "Renamed", description: "Review" });
  expect(
    (await bob.projects.getDetail(project.entityId)).actors.map((actor) => actor.entityId).sort(),
  ).toEqual([f.alice, f.bob].sort());
});

test("project references enforce entity type and organization alignment", async () => {
  expect(
    await rejection(
      f.db
        .insert(projects)
        .values({ entityId: f.alice, organizationId: f.orgA, name: "Wrong type" })
        .execute(),
    ),
  ).toMatchObject({ cause: { code: "23503" } });
  const project = await f.forActor(f.alice).projects.create({ name: "Private" });
  expect(
    await rejection(
      f.db
        .update(projects)
        .set({ organizationId: f.orgB })
        .where(eq(projects.entityId, project.entityId))
        .execute(),
    ),
  ).toMatchObject({ cause: { code: "23503" } });
  await f
    .forActor(f.alice)
    .permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  expect(await f.forActor(f.outsider, f.orgB).projects.list()).toEqual([]);
  expect(
    await f.db.select().from(projects).where(eq(projects.entityId, project.entityId)),
  ).toHaveLength(1);
});
