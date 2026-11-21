import { rejected, result, tasks } from "./test-support/api";
import { test } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("Home summaries require a session and the active workspace", async ({
  actors,
  workspace,
  request,
}) => {
  const [owner, member] = await workspace(actors.owner, actors.member);
  for (const domain of ["tasks", "crm"]) {
    const path = `/api/v1/${domain}/home`;
    const params = { organizationId: owner.organizationId, today: "2026-11-21" };
    expect((await request.get(path, { params })).status()).toBe(401);
    await rejected(await actors.outsider.request.get(path, { params }));
    expect(await result(await member.request.get(path, { params }))).toEqual([]);
  }
});

test("Home tasks stop exposing assigned work when project access is revoked", async ({
  actors,
  workspace,
}) => {
  const [owner, member] = await workspace(actors.owner, actors.member);
  const projectEntityId = await tasks.create(owner, { action: "createProject", name: "Launch" });
  const project = await result<{ actors: { entityId: string; name: string }[] }>(
    await owner.request.get("/api/v1/tasks/project", {
      params: { organizationId: owner.organizationId, projectEntityId },
    }),
  );
  const memberId = project.actors.find((actor) => actor.name === member.name)!.entityId;
  await result(
    await tasks.write(owner, {
      action: "share",
      projectEntityId,
      actorEntityId: memberId,
      level: "view",
    }),
  );
  const id = await tasks.create(owner, {
    action: "createTask",
    projectEntityId,
    title: "Private launch review",
    assigneeActorEntityId: memberId,
  });
  const read = () =>
    member.request.get("/api/v1/tasks/home", {
      params: { organizationId: member.organizationId },
    });
  expect(await result(await read())).toMatchObject([
    { entityId: id, title: "Private launch review" },
  ]);
  await result(
    await tasks.write(owner, {
      action: "revoke",
      projectEntityId,
      actorEntityId: memberId,
    }),
  );
  expect(await result(await read())).toEqual([]);
});
