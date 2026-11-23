import { rejected, result, tasks, type WorkspaceClient } from "../test-support/api";
import { appOrigin } from "../test-support/environment";
import { test, type Actor } from "../test-support/fixtures";
import { expect } from "@playwright/test";

const { write, create, project } = tasks;
const origin = appOrigin;
const archivedMessage = "Restore the project first.";

async function setRole(owner: Actor, member: Actor, role: "admin" | "member") {
  const response = await owner.request.get("/api/auth/organization/get-full-organization", {
    params: { organizationId: owner.organizationId },
  });
  const organization: { members: { id: string; user: { email: string } }[] } =
    await response.json();
  const memberId = organization.members.find((row) => row.user.email === member.email)!.id;
  const updated = await owner.request.post("/api/auth/organization/update-member-role", {
    headers: { origin },
    data: { organizationId: owner.organizationId, memberId, role },
  });
  expect(updated.ok(), `The member becomes ${role}`).toBe(true);
}

async function actorId(viewer: WorkspaceClient, projectEntityId: string, name: string) {
  const detail = await result<{ actors: { entityId: string; name: string }[] }>(
    await project(viewer, projectEntityId),
  );
  return detail.actors.find((actor) => actor.name === name)!.entityId;
}

async function archivedList(actor: WorkspaceClient) {
  return result<{ entityId: string; name: string; level?: string }[]>(
    await actor.request.get("/api/v1/tasks/projects", {
      params: { organizationId: actor.organizationId, archived: "archived" },
    }),
  );
}

test("project owners and organization owners and admins archive and restore; others cannot", async ({
  actors,
  workspace,
}) => {
  const [owner, member] = await workspace(actors.owner, actors.member);
  // The member owns this project; the organization owner has no grant on it.
  const memberProject = await create(member, { action: "createProject", name: "Member plan" });
  await result(await write(owner, { action: "archiveProject", projectEntityId: memberProject }));
  await result(await write(member, { action: "restoreProject", projectEntityId: memberProject }));
  await result(await write(member, { action: "archiveProject", projectEntityId: memberProject }));

  const shared = await create(owner, { action: "createProject", name: "Shared plan" });
  const memberActor = await actorId(owner, shared, member.name);
  await result(
    await write(owner, {
      action: "share",
      projectEntityId: shared,
      actorEntityId: memberActor,
      level: "edit",
    }),
  );
  for (const action of ["archiveProject", "restoreProject", "deleteProject"] as const) {
    await rejected(await write(member, { action, projectEntityId: shared }));
    await rejected(await write(actors.outsider, { action, projectEntityId: shared }));
  }
  expect(
    (
      await write(
        owner,
        { action: "archiveProject", projectEntityId: shared },
        "https://untrusted.example.test",
      )
    ).status(),
  ).toBe(403);
  await result(await write(owner, { action: "archiveProject", projectEntityId: shared }));
  await rejected(await write(member, { action: "restoreProject", projectEntityId: shared }));

  // An organization admin manages a project nobody shared with them.
  const privateProject = await create(owner, { action: "createProject", name: "Private plan" });
  await rejected(
    await write(member, { action: "archiveProject", projectEntityId: privateProject }),
  );
  await setRole(owner, member, "admin");
  await result(await write(member, { action: "archiveProject", projectEntityId: privateProject }));
  await result(await write(member, { action: "restoreProject", projectEntityId: privateProject }));
});

test("only archived projects are deleted, and archived work rejects writes", async ({
  actors,
  workspace,
}) => {
  const [owner, member] = await workspace(actors.owner, actors.member);
  const projectEntityId = await create(owner, { action: "createProject", name: "Wrapped up" });
  const taskEntityId = await create(owner, {
    action: "createTask",
    projectEntityId,
    title: "Last task",
  });
  const discussion = await result<{ conversationId: string }>(
    await owner.request.post("/api/v1/tasks/discussion", {
      headers: { origin },
      data: { organizationId: owner.organizationId, projectEntityId, taskEntityId },
    }),
  );
  const notArchived = await write(owner, { action: "deleteProject", projectEntityId });
  expect(notArchived.status()).toBe(400);
  await result(await project(owner, projectEntityId));

  await result(await write(owner, { action: "archiveProject", projectEntityId }));
  const writes = [
    { action: "updateProject" as const, projectEntityId, name: "Renamed", description: "" },
    { action: "createTask" as const, projectEntityId, title: "Another" },
    { action: "updateTask" as const, projectEntityId, taskEntityId, status: "completed" as const },
    { action: "deleteTask" as const, projectEntityId, taskEntityId },
  ];
  for (const input of writes) {
    const response = await write(owner, input);
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { message: archivedMessage },
    });
    // A member without access gets the normal access error and no archive state.
    await rejected(await write(member, input), [archivedMessage, "Wrapped up"]);
  }
  const comment = await owner.request.post("/api/v1/messaging/messages", {
    headers: { origin },
    data: {
      organizationId: owner.organizationId,
      conversationId: discussion.conversationId,
      body: "After archive",
    },
  });
  expect(comment.status()).toBe(400);

  // Reads still work for readers.
  const detail = await result<{ project: { archivedAt: string | null }; tasks: unknown[] }>(
    await project(owner, projectEntityId),
  );
  expect(detail.project.archivedAt).not.toBeNull();
  expect(detail.tasks).toHaveLength(1);

  await result(await write(owner, { action: "deleteProject", projectEntityId }));
  await rejected(await project(owner, projectEntityId));
});

test("archived projects and their metadata stay hidden from people without access", async ({
  actors,
  workspace,
}) => {
  const [owner, member] = await workspace(actors.owner, actors.member);
  const hidden = await create(owner, { action: "createProject", name: "Hidden archive" });
  const visible = await create(owner, { action: "createProject", name: "Visible archive" });
  const memberActor = await actorId(owner, visible, member.name);
  await result(
    await write(owner, {
      action: "share",
      projectEntityId: visible,
      actorEntityId: memberActor,
      level: "view",
    }),
  );
  await result(await write(owner, { action: "archiveProject", projectEntityId: hidden }));
  await result(await write(owner, { action: "archiveProject", projectEntityId: visible }));

  expect((await archivedList(owner)).map((row) => row.name).sort()).toEqual([
    "Hidden archive",
    "Visible archive",
  ]);
  expect(await archivedList(member)).toMatchObject([{ entityId: visible, level: "view" }]);
  expect(await archivedList(actors.outsider)).toEqual([]);
  const active = await result<{ entityId: string }[]>(
    await owner.request.get("/api/v1/tasks/projects", {
      params: { organizationId: owner.organizationId },
    }),
  );
  expect(active.map((row) => row.entityId)).not.toContain(hidden);
  await rejected(await project(member, hidden), ["Hidden archive"]);
  await rejected(await project(actors.outsider, hidden), ["Hidden archive"]);
});
