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

export function createTestScopes(
  overrides: Omit<Partial<ScopeDependencies>, "repositories"> & {
    repositories?: Partial<ScopeDependencies["repositories"]>;
  } = {},
) {
  const scope = scopeFixture();
  const { repositories, ...dependencies } = overrides;
  return createScopes({
    api: {
      getSession: async () => scope.session,
      getActiveMemberRole: async () => ({ role: "owner" }),
    },
    repositories: {
      forOwnerSession: async () => scope.owner,
      forSession: async () => scope.repositories,
      // SAFETY: Boundary-only tests never call native repository methods.
      forDeviceSession: async () =>
        ({}) as Awaited<ReturnType<ScopeDependencies["repositories"]["forDeviceSession"]>>,
      ...repositories,
    },
    checkDevice: async () => {},
    ...dependencies,
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

/**
 * A service whose every method rejects. A route that calls it answers 500, so boundary tests that
 * expect 400 fail if validation lets a request through.
 */
export function createUnreachableServices<T extends object>(): T {
  // SAFETY: Every method read returns a function that rejects, so no caller can use a result.
  return new Proxy({} as T, {
    get: (_target, name) =>
      // Not a thenable, so the proxy can be awaited or returned from async code.
      name === "then"
        ? undefined
        : async () => {
            throw new Error(`unexpected service call: ${String(name)}`);
          },
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
