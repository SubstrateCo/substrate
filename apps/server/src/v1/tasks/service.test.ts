import { failure } from "@startup-os/contracts/result";
import * as database from "@startup-os/database";
import * as provisioning from "@startup-os/database/provisioning";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { getProject } from "./service";
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
      image: null,
    },
    level: "view",
    members: [
      {
        actorEntityId: actor.entityId,
        name: actor.name,
        image: null,
        type: "human",
        level: "view",
      },
    ],
    actors: [
      { entityId: actor.entityId, name: actor.name, image: null, type: "human", assignable: true },
    ],
    tasks: [],
  };
  const getDetail = spyOn(repositories.projects, "getDetail").mockResolvedValue(detail);

  const forActor = spyOn(factory, "forActor").mockReturnValue(repositories);
  spyOn(database, "createRepositories").mockReturnValue(factory);
  return {
    input,
    session,
    getSession,
    resolveHumanActor,
    ensureOwnedAgentActors,
    getDetail,
    forActor,
  };
}

for (const denial of ["signed out", "unverified", "workspace mismatch"] as const) {
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
          "WORKSPACE_CHANGED",
          "Your active workspace changed. Reload this page to continue.",
        );
        break;
    }
    expect(await getProject(new Headers(), fixture.input)).toEqual(expected);
    expect(fixture.resolveHumanActor).not.toHaveBeenCalled();
    expect(fixture.ensureOwnedAgentActors).not.toHaveBeenCalled();
    expect(fixture.forActor).not.toHaveBeenCalled();
    expect(fixture.getDetail).not.toHaveBeenCalled();
  });
}
