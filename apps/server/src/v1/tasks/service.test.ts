import { failure } from "@startup-os/contracts/result";
import * as database from "@startup-os/database";
import * as provisioning from "@startup-os/database/provisioning";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { getProject, listTaskComments, mutateTasks } from "./service";
import { APIError } from "better-auth/api";
import { afterEach, expect, mock, spyOn, test } from "bun:test";

afterEach(() => mock.restore());

function projectFixture() {
  const input = { organizationId: "org", projectEntityId: crypto.randomUUID() };
  const session = {
    user: {
      id: "alice",
      name: "Alice",
      email: "alice@example.test",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: "session",
      userId: "alice",
      token: "token",
      activeOrganizationId: input.organizationId,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    },
  };
  const getSession = spyOn(auth.api, "getSession").mockResolvedValue(session);
  const getRole = spyOn(auth.api, "getActiveMemberRole").mockResolvedValue({ role: "member" });
  const actor = {
    entityId: crypto.randomUUID(),
    organizationId: input.organizationId,
    entityType: "actor" as const,
    name: session.user.name,
    type: "human" as const,
    userId: session.user.id,
    userAgentId: null,
    agentConfig: null,
    disabledAt: null,
  };
  const resolveHumanActor = spyOn(provisioning, "resolveHumanActor").mockResolvedValue(actor);
  const ensureOwnedAgentActors = spyOn(provisioning, "ensureOwnedAgentActors").mockResolvedValue(
    [],
  );
  const factory = database.createRepositories(db);
  const repositories = factory.forActor({
    organizationId: input.organizationId,
    actorEntityId: actor.entityId,
  });
  const detail: Awaited<ReturnType<typeof repositories.projects.getDetail>> = {
    project: {
      entityId: input.projectEntityId,
      organizationId: input.organizationId,
      entityType: "project",
      name: "Launch",
      description: "Ship the desktop app",
    },
    level: "view",
    members: [{ actorEntityId: actor.entityId, name: actor.name, type: "human", level: "view" }],
    actors: [{ entityId: actor.entityId, name: actor.name, type: "human", assignable: true }],
    tasks: [],
  };
  const getDetail = spyOn(repositories.projects, "getDetail").mockResolvedValue(detail);
  const transaction = spyOn(repositories, "transaction").mockImplementation(async (work) =>
    work(repositories),
  );
  const forActor = spyOn(factory, "forActor").mockReturnValue(repositories);
  spyOn(database, "createRepositories").mockReturnValue(factory);
  return {
    input,
    session,
    actor,
    detail,
    getSession,
    getRole,
    resolveHumanActor,
    ensureOwnedAgentActors,
    getDetail,
    forActor,
    repositories,
    transaction,
  };
}

test("task comments pass the expected project to the repository without fetching the task twice", async () => {
  const fixture = projectFixture();
  const taskEntityId = crypto.randomUUID();
  const comments = [
    {
      id: crypto.randomUUID(),
      body: "Ready",
      createdAt: new Date(),
      authorName: "Alice",
      authorType: "human" as const,
    },
  ];
  const get = spyOn(fixture.repositories.tasks, "get").mockRejectedValue(
    new Error("Duplicate task read"),
  );
  const listComments = spyOn(fixture.repositories.tasks, "listComments").mockResolvedValue(
    comments,
  );
  expect(await listTaskComments(new Headers(), { ...fixture.input, taskEntityId })).toEqual({
    success: true,
    data: comments,
  });
  expect(listComments).toHaveBeenCalledWith(taskEntityId, fixture.input.projectEntityId);
  expect(get).not.toHaveBeenCalled();
  listComments.mockRejectedValue(new database.AccessDeniedError());
  expect(await listTaskComments(new Headers(), { ...fixture.input, taskEntityId })).toEqual(
    failure("NOT_FOUND", "Item not found or access denied."),
  );
});

test("task writes return a typed origin failure rather than throwing", async () => {
  expect(
    await mutateTasks(new Headers({ origin: "https://foreign.test" }), {
      organizationId: "org",
      action: "createProject",
      name: "Launch",
    }),
  ).toEqual(failure("FORBIDDEN", "Invalid request origin."));
});

test("project detail uses one authenticated workspace and retains provisioning and actor scope", async () => {
  const fixture = projectFixture();
  expect(await getProject(new Headers(), fixture.input)).toEqual({
    success: true,
    data: fixture.detail,
  });
  expect(fixture.getSession).toHaveBeenCalledTimes(1);
  expect(fixture.getRole).toHaveBeenCalledTimes(1);
  expect(fixture.ensureOwnedAgentActors).toHaveBeenCalledWith(db, {
    organizationId: fixture.input.organizationId,
    userId: fixture.session.user.id,
  });
  expect(fixture.resolveHumanActor).toHaveBeenCalledWith(db, {
    organizationId: fixture.input.organizationId,
    userId: fixture.session.user.id,
  });
  expect(fixture.forActor).toHaveBeenCalledWith({
    organizationId: fixture.input.organizationId,
    actorEntityId: fixture.actor.entityId,
  });
  expect(fixture.getDetail).toHaveBeenCalledWith(fixture.input.projectEntityId);
  expect(fixture.transaction).not.toHaveBeenCalled();
});

for (const denial of ["signed out", "unverified", "workspace mismatch", "not a member"] as const) {
  test(`project detail rejects ${denial} before provisioning or project access`, async () => {
    const fixture = projectFixture();
    let expected;
    switch (denial) {
      case "signed out":
        fixture.getSession.mockResolvedValue(null);
        expected = failure("UNAUTHENTICATED", "Sign in to continue.");
        break;
      case "unverified":
        fixture.session.user.emailVerified = false;
        expected = failure("FORBIDDEN", "Verify your email to continue.");
        break;
      case "workspace mismatch":
        fixture.session.session.activeOrganizationId = "other-org";
        expected = failure(
          "FORBIDDEN",
          "Your active workspace changed. Reload this page to continue.",
        );
        break;
      case "not a member":
        fixture.getRole.mockRejectedValue(new APIError("FORBIDDEN"));
        expected = failure("FORBIDDEN", "Access denied.");
        break;
    }
    expect(await getProject(new Headers(), fixture.input)).toEqual(expected);
    expect(fixture.resolveHumanActor).not.toHaveBeenCalled();
    expect(fixture.ensureOwnedAgentActors).not.toHaveBeenCalled();
    expect(fixture.forActor).not.toHaveBeenCalled();
    expect(fixture.getDetail).not.toHaveBeenCalled();
  });
}

test("project detail hides missing or inaccessible projects even for an organization admin", async () => {
  const fixture = projectFixture();
  fixture.getRole.mockResolvedValue({ role: "admin" });
  fixture.getDetail.mockRejectedValue(new database.AccessDeniedError());
  expect(await getProject(new Headers(), fixture.input)).toEqual(
    failure("NOT_FOUND", "Item not found or access denied."),
  );
});
