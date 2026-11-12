import { desktopInstallationHeader } from "@substrate/contracts/desktop/links";
import type { createRepositories } from "@substrate/database";

import type { Auth } from "../auth/server";
import { respond } from "./http";
import { ServiceError, serviceResult } from "./service-result";
import { requireVerified, requireWorkspace } from "./workspace";
import type { Env, ValidationTargets } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
export interface SettingsScope {
  session: AuthSession | null;
  role: string | null;
}
type Repositories = ReturnType<typeof createRepositories>;
export interface UserScope {
  session: AuthSession;
  userId: string;
  organizationId: string | null;
  installationId?: string;
  owner: Awaited<ReturnType<Repositories["forOwnerSession"]>>;
}
export interface WorkspaceScope extends UserScope {
  organizationId: string;
  repositories: Awaited<ReturnType<Repositories["forSession"]>>;
}
export interface DeviceScope extends WorkspaceScope {
  installationId: string;
}
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
  checkDevice(userId: string, installationId: string): Promise<void>;
}

type ScopeInput = { organizationId?: string; installationId?: string };
type ValidatedScopeInput = { out: Record<keyof ValidationTargets, ScopeInput> };

export function createScopes(deps: ScopeDependencies) {
  async function user(headers: Headers, result: AuthSession | null): Promise<UserScope> {
    const session = requireVerified(result);
    const installationId = z.uuid().safeParse(headers.get(desktopInstallationHeader)).data;
    const userId = session.user.id;
    return {
      session,
      userId,
      organizationId: session.session.activeOrganizationId ?? null,
      installationId,
      owner: await deps.repositories.forOwnerSession({ userId, installationId }),
    };
  }
  async function workspace(
    headers: Headers,
    result: AuthSession | null,
    expected?: string,
  ): Promise<WorkspaceScope> {
    const scope = await user(headers, result);
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
        return resolve(c.req.raw.headers, input, session);
      });
      if (!result.success) return respond(c, result);
      c.set("scope", result.data);
      await next();
    });
  }
  async function registered<S extends UserScope>(scope: S, input: ScopeInput) {
    if (!scope.installationId || scope.installationId !== input.installationId)
      throw new ServiceError("FORBIDDEN", "Invalid desktop installation.");
    await deps.checkDevice(scope.userId, scope.installationId);
    return { ...scope, installationId: scope.installationId };
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
    user: () => middleware((headers, _input, session) => user(headers, session)),
    registeredUserDevice: (target: keyof ValidationTargets) =>
      middleware(
        async (headers, input, session) => registered(await user(headers, session), input),
        target,
      ),
    workspace: (target?: keyof ValidationTargets) =>
      middleware(
        (headers, input, session) => workspace(headers, session, input.organizationId),
        target,
      ),
    device: (target: keyof ValidationTargets) =>
      middleware(async (headers, input, session): Promise<DeviceScope> => {
        const scope = await workspace(headers, session, input.organizationId);
        return registered(scope, input);
      }, target),
  };
}
export type Scopes = ReturnType<typeof createScopes>;
