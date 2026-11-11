import { publicFailure } from "@substrate/contracts/result";
import * as database from "@substrate/database";
import * as provisioning from "@substrate/database/trusted";

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
  const ensureOwnedAgentActors = spyOn(provisioning, "ensureOwnedAgentActors").mockResolvedValue(
    [],
  );
  const createRepositories = spyOn(database, "createRepositories");
  return {
    input,
    session,
    getSession,
    ensureOwnedAgentActors,
    createRepositories,
  };
}

for (const denial of ["signed out", "unverified", "workspace mismatch"] as const) {
  test(`project detail rejects ${denial} before provisioning or project access`, async () => {
    const fixture = projectFixture();
    let expected;
    switch (denial) {
      case "signed out":
        fixture.getSession.mockResolvedValue(null);
        expected = publicFailure("UNAUTHENTICATED", "Sign in to continue.");
        break;
      case "unverified":
        fixture.session.user.emailVerified = false;
        expected = publicFailure(
          "FORBIDDEN",
          "Verify your email to continue.",
          "EMAIL_NOT_VERIFIED",
        );
        break;
      case "workspace mismatch":
        fixture.session.session.activeOrganizationId = "other-org";
        expected = publicFailure(
          "WORKSPACE_CHANGED",
          "Your active workspace changed. Reload this page to continue.",
        );
        break;
    }
    expect(await getProject(new Headers(), fixture.input)).toEqual(expected);
    expect(fixture.ensureOwnedAgentActors).not.toHaveBeenCalled();
    expect(fixture.createRepositories).not.toHaveBeenCalled();
  });
}
