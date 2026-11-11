import { AccessDeniedError, ValidationError } from "../../errors";
import { entities, projects } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("project editors can set, replace and clear the project icon, and existing reads carry it", async () => {
  const alice = f.forActor(f.alice);
  const bob = f.forActor(f.bob);
  const project = await alice.projects.create({ name: "Project pictures" });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  const image = `/api/v1/files/pictures/project-icon/${project.entityId}?v=${crypto.randomUUID()}`;
  await bob.projects.setPicture(project.entityId, image);
  expect((await alice.projects.getDetail(project.entityId)).project.image).toBe(image);
  expect(
    (await bob.projects.list()).find((item) => item.entityId === project.entityId)?.image,
  ).toBe(image);
  const replacement = `/api/v1/files/pictures/project-icon/${project.entityId}?v=${crypto.randomUUID()}`;
  await alice.projects.setPicture(project.entityId, replacement);
  expect((await bob.projects.get(project.entityId)).image).toBe(replacement);
  await bob.projects.setPicture(project.entityId, null);
  expect((await alice.projects.get(project.entityId)).image).toBeNull();
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, project.entityId));
  expect(await rejection(alice.projects.setPicture(project.entityId, image))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("the database rejects project icons belonging to a different project, and picture writes roll back", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Picture constraints" });
  const other = await alice.projects.create({ name: "Other project" });
  const image = `/api/v1/files/pictures/project-icon/${project.entityId}?v=${crypto.randomUUID()}`;
  await rejection(
    f.db.update(projects).set({ image }).where(eq(projects.entityId, other.entityId)).execute(),
  );
  expect(
    await rejection(
      alice.transaction(async (repos) => {
        await repos.projects.setPicture(project.entityId, image);
        throw new Error("rollback picture");
      }),
    ),
  ).toMatchObject({ message: expect.stringContaining("rollback picture") });
  expect((await alice.projects.get(project.entityId)).image).toBeNull();
});

test("project icon changes enforce project access and reject external or another project's picture", async () => {
  const alice = f.forActor(f.alice);
  const bob = f.forActor(f.bob);
  const project = await alice.projects.create({ name: "Private" });
  const other = await alice.projects.create({ name: "Other" });
  const image = `/api/v1/files/pictures/project-icon/${project.entityId}?v=${crypto.randomUUID()}`;
  expect(await rejection(bob.projects.setPicture(project.entityId, image))).toBeInstanceOf(
    AccessDeniedError,
  );
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(await rejection(bob.projects.setPicture(project.entityId, image))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(
    await rejection(f.forActor(f.outsider, f.orgB).projects.setPicture(project.entityId, image)),
  ).toBeInstanceOf(AccessDeniedError);
  for (const invalid of [
    "https://example.test/icon.png",
    `/api/v1/files/pictures/project-icon/${other.entityId}?v=${crypto.randomUUID()}`,
  ]) {
    expect(await rejection(alice.projects.setPicture(project.entityId, invalid))).toBeInstanceOf(
      ValidationError,
    );
  }
  expect((await alice.projects.get(project.entityId)).image).toBeNull();
});
