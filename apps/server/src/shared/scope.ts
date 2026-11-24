import { desktopInstallationHeader } from "@substrate/contracts/desktop/links";
import type { createRepositories } from "@substrate/database";

import { respond } from "./http";
import type {
  AuthSession,
  DeviceScope,
  IdentityScope,
  SettingsScope,
  UserScope,
  WorkspaceScope,
} from "./scope-types";
import { ServiceError, serviceResult } from "./service-result";
import { requireVerified, requireWorkspace } from "./workspace";
import type { Env, ValidationTargets } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

type Repositories = ReturnType<typeof createRepositories>;
export type ScopeEnv<S = WorkspaceScope> = Env & { Variables: { scope: S } };

export interface ScopeDependencies {
  api: {
    getSession(input: {
      headers: Headers;
      query: { disableRefresh: true };
    }): Promise<AuthSession | null>;
    getActiveMemberRole(input: {
      headers: Headers;
      query: { organizationId: string };
    }): Promise<{ role: string }>;
  };
  repositories: Repositories;
}

type ScopeInput = { organizationId?: string; installationId?: string; expectedUserId?: string };
type ValidatedScopeInput = { out: Record<keyof ValidationTargets, ScopeInput> };

export function createScopes(deps: ScopeDependencies) {
  function identity(headers: Headers, result: AuthSession | null): IdentityScope {
    const session = requireVerified(result);
    const installationId = z.uuid().safeParse(headers.get(desktopInstallationHeader)).data;
    const userId = session.user.id;
    return {
      session,
      userId,
      organizationId: session.session.activeOrganizationId ?? null,
      installationId,
    };
  }
  async function user(headers: Headers, result: AuthSession | null): Promise<UserScope> {
    const scope = identity(headers, result);
    const owner = await deps.repositories.forOwnerSession({
      userId: scope.userId,
      installationId: scope.installationId,
    });
    return { ...scope, owner };
  }
  async function workspace(
    headers: Headers,
    result: AuthSession | null,
    expected?: string,
  ): Promise<WorkspaceScope> {
    const scope = identity(headers, result);
    const organizationId = requireWorkspace(
      expected ?? scope.organizationId ?? "",
      scope.organizationId,
    );
    // forSession verifies membership before constructing any domain repository, including sharing.
    const repositories = await deps.repositories.forSession({
      userId: scope.userId,
      organizationId,
    });
    return { ...scope, organizationId, repositories };
  }
  function middleware<S>(
    resolve: (headers: Headers, input: ScopeInput, session: AuthSession | null) => Promise<S>,
    target?: keyof ValidationTargets,
  ) {
    return createMiddleware<ScopeEnv<S>, string, ValidatedScopeInput>(async (c, next) => {
      const input = target ? c.req.valid(target) : {};
      const result = await serviceResult(async () => {
        const session = await deps.api.getSession({
          headers: c.req.raw.headers,
          query: {
            // Better Auth's own endpoint owns renewal and delivers the updated cookies.
            disableRefresh: true,
          },
        });
        if (input.expectedUserId && session && input.expectedUserId !== session.user.id)
          throw new ServiceError("FORBIDDEN", "The signed-in account changed.");
        return resolve(c.req.raw.headers, input, session);
      });
      if (!result.success) return respond(c, result);
      c.set("scope", result.data);
      await next();
    });
  }
  return {
    settings: () =>
      middleware(async (headers, _input, session): Promise<SettingsScope> => {
        const organizationId = session?.session.activeOrganizationId;
        const role =
          session?.user.emailVerified && organizationId
            ? (await deps.api.getActiveMemberRole({ headers, query: { organizationId } })).role
            : null;
        return { session, role };
      }),
    /** A verified session, without repositories: for user-level actions such as account links. */
    identity: () => middleware(async (headers, _input, session) => identity(headers, session)),
    user: () => middleware((headers, _input, session) => user(headers, session)),
    workspace: (target?: keyof ValidationTargets) =>
      middleware(
        (headers, input, session) => workspace(headers, session, input.organizationId),
        target,
      ),
    device: (target: keyof ValidationTargets) =>
      middleware(async (headers, input, session): Promise<DeviceScope> => {
        const scope = identity(headers, session);
        const organizationId = requireWorkspace(
          input.organizationId ?? scope.organizationId ?? "",
          scope.organizationId,
        );
        if (!scope.installationId || scope.installationId !== input.installationId)
          throw new ServiceError("FORBIDDEN", "Invalid desktop installation.");
        const device = await deps.repositories.forDeviceSession({
          userId: scope.userId,
          organizationId,
          installationId: scope.installationId,
        });
        return { ...scope, organizationId, installationId: scope.installationId, device };
      }, target),
  };
}
export type Scopes = ReturnType<typeof createScopes>;
