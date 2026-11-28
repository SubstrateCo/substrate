import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { projectIconAccess } from "./project-icons";
import { expect, test } from "bun:test";

const f = setupDatabase();

test("project icons need edit access to change and view access to read, in the person's workspace", async () => {
  await f.verifyEmails();
  const access = projectIconAccess(f.db);
  const project = await f.forActor(f.alice).projects.create({ name: "Icons" });
  await f.forActor(f.alice).permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(await access.canRead({ userId: "alice", organizationId: f.orgA }, project.entityId)).toBe(
    false,
  );
  await f
    .forActor(f.alice)
    .projects.setPicture(
      project.entityId,
      `/api/v1/files/pictures/project-icon/${project.entityId}?v=${crypto.randomUUID()}`,
    );
  const alice = { userId: "alice", organizationId: f.orgA };
  const bob = { userId: "bob", organizationId: f.orgA };
  await access.requireEdit(alice, project.entityId);
  expect(await rejection(access.requireEdit(bob, project.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await access.canRead(bob, project.entityId)).toBe(true);
  for (const scope of [
    { userId: "outsider", organizationId: f.orgB },
    { userId: "outsider", organizationId: f.orgA },
    { userId: "alice", organizationId: null },
  ])
    expect(await access.canRead(scope, project.entityId)).toBe(false);
});
