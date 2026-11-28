import type { Database } from "@substrate/database/trusted";

import type { AppDependencies } from "./app";
import { sessionFixture } from "./auth/test-support";
import { createServices } from "./services";
import { createScopes, type ScopeDependencies } from "./shared/scope";
import type { UserScope, WorkspaceScope } from "./shared/scope-types";
import type { ObjectStorage } from "./storage/types";
import { createCalendarProviders } from "./v1/calendar/providers";
import type { ImageCodec } from "./v1/files/image-codec";

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
    ...dependencies,
  });
}

export function createTestServices() {
  return createServices({
    // SAFETY: Construction does no I/O. Tests replace services or repositories before calling them.
    db: {} as Database,
    // SAFETY: Construction does no I/O. Tests replace services or repositories before calling them.
    storage: {} as ObjectStorage,
    // SAFETY: Construction does no I/O. Tests replace services or repositories before calling them.
    images: {} as ImageCodec,
    publish: async (committed) => committed.result,
    apiURL: "http://localhost:3001",
    desktop: { desktopScheme: "substrate-dev", webURL: "http://localhost:3000" },
    calendar: {
      providers: createCalendarProviders(
        { google: undefined, microsoft: undefined },
        {
          api: {
            getAccessToken: async () => {
              throw new Error("Tests that reach provider tokens must provide their own fake.");
            },
          },
        },
      ),
      triggerSync: () => {},
    },
    googleLink: {
      create: async () => {
        throw new Error("Tests that create link tickets must provide their own fake.");
      },
      start: async () => null,
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
