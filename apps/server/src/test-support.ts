import type { Database } from "@substrate/database/trusted";

import type { AppDependencies } from "./app";
import { sessionFixture } from "./auth/test-support";
import { createServices } from "./services";
import {
  createScopes,
  type ScopeDependencies,
  type WorkspaceScope,
  type UserScope,
} from "./shared/scope";
import type { ObjectStorage } from "./storage/types";

export function scopeFixture(): WorkspaceScope & UserScope {
  const session = sessionFixture({ organizationId: "org" });
  return {
    session,
    userId: session.user.id,
    organizationId: "org",
    // SAFETY: Tests replace every repository method they call. Boundary-only cases never use these sentinels.
    owner: {} as UserScope["owner"],
    // SAFETY: Tests replace every repository method they call. Boundary-only cases never use these sentinels.
    repositories: {} as WorkspaceScope["repositories"],
  };
}

export function createTestScopes(overrides: Partial<ScopeDependencies> = {}) {
  const scope = scopeFixture();
  return createScopes({
    api: {
      getSession: async () => scope.session,
      getActiveMemberRole: async () => ({ role: "owner" }),
    },
    repositories: {
      forOwnerSession: async () => scope.owner,
      forSession: async () => scope.repositories,
    },
    checkDevice: async () => {},
    ...overrides,
  });
}

export function createTestServices() {
  // Construction is inert. Any test that reaches storage or SQL must provide its own fake.
  return createServices({
    // SAFETY: Construction does no I/O. Tests replace services or repositories before calling them.
    db: {} as Database,
    // SAFETY: Construction does no I/O. Tests replace services or repositories before calling them.
    storage: {} as ObjectStorage,
    publish: async (committed) => committed.result,
  });
}

export function appFixture(): AppDependencies {
  return {
    auth: { handler: async () => new Response(null, { status: 404 }) },
    services: createTestServices(),
    scopes: createTestScopes(),
    trustedOrigins: ["http://localhost:3000"],
  };
}
