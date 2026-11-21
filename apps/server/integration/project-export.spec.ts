import { result, tasks } from "./test-support/api";
import { test } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("project exports enforce access and tenant boundaries and include all task pages", async ({
  actors,
  workspace,
  request: anonymous,
}) => {
  const [owner, member] = await workspace(actors.owner, actors.member);
  const projectEntityId = await tasks.create(owner, {
    action: "createProject",
    name: "Export project",
    description: "Project description",
  });
  const otherProject = await tasks.create(owner, {
    action: "createProject",
    name: "Other project",
  });
  const hiddenTask = await tasks.create(owner, {
    action: "createTask",
    projectEntityId: otherProject,
    title: "Hidden task",
  });
  const ids: string[] = [];
  for (let i = 0; i < 101; i++) {
    ids.push(
      await tasks.create(owner, {
        action: "createTask",
        projectEntityId,
        title: `Export task ${i}`,
        description: "Task description",
        priority: "high",
        dueDate: "2026-12-01",
      }),
    );
  }
  const params = { organizationId: owner.organizationId, projectEntityId, format: "json" };
  for (const [client, status] of [
    [anonymous, 401],
    [member.request, 404],
    [actors.outsider.request, 403],
  ] as const) {
    const response = await client.get("/api/v1/tasks/export", { params });
    expect(response.status()).toBe(status);
    expect(await response.text()).not.toContain("Export project");
  }
  const detail = await result<{ actors: { entityId: string; name: string }[] }>(
    await owner.request.get("/api/v1/tasks/project", { params }),
  );
  await result(
    await tasks.write(owner, {
      action: "share",
      projectEntityId,
      actorEntityId: detail.actors.find((actor) => actor.name === member.name)!.entityId,
      level: "view",
    }),
  );
  const response = await member.request.get("/api/v1/tasks/export", { params });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toBe(
    `attachment; filename="project-${projectEntityId}.json"`,
  );
  expect(response.headers()["cache-control"]).toBe("no-store");
  const records = await response.json();
  expect(records[0]).toMatchObject({
    recordType: "project",
    name: "Export project",
    description: "Project description",
  });
  expect(
    records
      .slice(1)
      .map((row: { entityId: string }) => row.entityId)
      .sort(),
  ).toEqual(ids.sort());
  expect(JSON.stringify(records)).not.toContain(hiddenTask);
  expect(records[1]).toMatchObject({
    description: "Task description",
    priority: "high",
    dueDate: "2026-12-01",
  });
  expect(
    (
      await owner.request.get("/api/v1/tasks/export", { params: { ...params, format: "xml" } })
    ).status(),
  ).toBe(400);
  await result(
    await tasks.write(owner, {
      action: "revoke",
      projectEntityId,
      actorEntityId: detail.actors.find((actor) => actor.name === member.name)!.entityId,
    }),
  );
  expect((await member.request.get("/api/v1/tasks/export", { params })).status()).toBe(404);
});
