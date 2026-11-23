import { appIds } from "@substrate/contracts/apps";
import { desktopAgentCatalogSchema } from "@substrate/contracts/harness";

import { createHash } from "node:crypto";
import { z } from "zod";

const verifiedSessionSchema = z.object({
  user: z.object({ id: z.string().min(1), emailVerified: z.literal(true) }),
  session: z.object({
    activeOrganizationId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/),
  }),
});
const catalogSchema = z.object({ success: z.literal(true), data: desktopAgentCatalogSchema });
const appSettingsSchema = z.object({
  success: z.literal(true),
  data: z.object({ organizationId: z.string(), enabledApps: z.array(z.enum(appIds)) }),
});

/**
 * The backend answered that this account or membership is no longer valid. Other failures,
 * such as network errors and 5xx answers, are transient.
 */
export class HarnessAccessDenied extends Error {}

const deniedStatuses = new Set([401, 403, 404]);

async function readVerifiedSession(
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>,
  backend: string,
  disableCookieCache = false,
  signal?: AbortSignal,
) {
  const url = new URL("/api/auth/get-session", backend);
  if (disableCookieCache) url.searchParams.set("disableCookieCache", "true");
  const response = await fetchAPI(url.href, {
    method: "GET",
    redirect: "error",
    signal,
  });
  signal?.throwIfAborted();
  if (deniedStatuses.has(response.status)) throw new HarnessAccessDenied("Session ended.");
  if (!response.ok) throw new Error("Session unavailable.");
  const result = verifiedSessionSchema.safeParse(await response.json());
  signal?.throwIfAborted();
  // A valid answer without a verified user and an active organization denies access.
  if (!result.success) throw new HarnessAccessDenied("Session is not verified.");
  return result.data;
}

type AuthorityOptions = {
  backend: string;
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
};

export class DesktopSessionAuthority {
  generation = 0;
  private lifetime = new AbortController();
  identity: string | undefined;
  private verified: Promise<Authorization> | undefined;
  private verifiedAt = 0;
  private invalidated = false;
  private cachedCatalog: Promise<z.output<typeof desktopAgentCatalogSchema>> | undefined;
  private cachedApps: Promise<z.output<typeof appSettingsSchema>["data"]> | undefined;
  private listeners = new Set<() => void>();
  private options: AuthorityOptions;
  constructor(options: AuthorityOptions) {
    this.options = options;
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  invalidate() {
    this.generation++;
    this.lifetime.abort(new Error("Session changed."));
    this.lifetime = new AbortController();
    this.invalidated = true;
    this.verified = undefined;
    this.cachedCatalog = undefined;
    this.cachedApps = undefined;
    this.identity = undefined;
    for (const listener of this.listeners) listener();
  }

  invalidateCatalog() {
    this.cachedCatalog = undefined;
    this.cachedApps = undefined;
  }

  appSettings() {
    const pending = (this.cachedApps ??= this.verify().then((auth) => this.readAppSettings(auth)));
    pending.catch(() => {
      if (this.cachedApps === pending) this.cachedApps = undefined;
    });
    return pending;
  }

  /** Mail reads private local data and can run without the renderer or a realtime connection. */
  async readAppSettings(auth: Authorization, caller?: AbortSignal) {
    const signal = caller ? AbortSignal.any([this.lifetime.signal, caller]) : this.lifetime.signal;
    const url = new URL("/api/v1/organizations/apps", this.options.backend);
    url.searchParams.set("organizationId", auth.organizationId);
    const response = await this.options.fetchAPI(url.href, {
      method: "GET",
      redirect: "error",
      signal,
    });
    signal.throwIfAborted();
    if (deniedStatuses.has(response.status))
      throw new HarnessAccessDenied("App settings access ended.");
    if (!response.ok) throw new Error("App settings unavailable.");
    const { data } = appSettingsSchema.parse(await response.json());
    signal.throwIfAborted();
    if (data.organizationId !== auth.organizationId) throw new Error("Session changed.");
    return data;
  }

  /** A catalog request must not configure a worker after the backend workspace changed. */
  async confirm(auth: Authorization, caller?: AbortSignal) {
    const signal = caller ? AbortSignal.any([this.lifetime.signal, caller]) : this.lifetime.signal;
    signal.throwIfAborted();
    const latest = await readVerifiedSession(
      this.options.fetchAPI,
      this.options.backend,
      false,
      signal,
    );
    // A late response from an old generation cannot invalidate the current one.
    signal.throwIfAborted();
    if (latest.user.id !== auth.userId) throw new HarnessAccessDenied("Account changed.");
    if (latest.session.activeOrganizationId !== auth.organizationId) {
      this.invalidate();
      throw new Error("Session changed.");
    }
  }

  verify(): Promise<Authorization> {
    if (this.verified && Date.now() - this.verifiedAt < 60_000) return this.verified;
    const generation = this.generation;
    this.verifiedAt = Date.now();
    const pending = this.readAuthorization(this.invalidated, this.lifetime.signal).then((auth) => {
      if (generation !== this.generation) throw new Error("Session changed.");
      this.invalidated = false;
      this.identity = auth.identity;
      return auth;
    });
    this.verified = pending;
    pending.catch(() => {
      if (this.verified === pending) this.verified = undefined;
    });
    return pending;
  }

  private async readAuthorization(disableCookieCache: boolean, signal: AbortSignal) {
    const options = this.options;
    const data = await readVerifiedSession(
      options.fetchAPI,
      options.backend,
      disableCookieCache,
      signal,
    );
    signal.throwIfAborted();
    const organizationId = data.session.activeOrganizationId;
    const membershipURL = new URL("/api/auth/organization/get-active-member-role", options.backend);
    membershipURL.searchParams.set("organizationId", organizationId);
    const membership = await options.fetchAPI(membershipURL.href, {
      method: "GET",
      redirect: "error",
      signal,
    });
    signal.throwIfAborted();
    if (deniedStatuses.has(membership.status))
      throw new HarnessAccessDenied("Organization membership ended.");
    if (!membership.ok) throw new Error("Organization unavailable.");
    if (!z.object({ role: z.string().min(1) }).safeParse(await membership.json()).success)
      throw new HarnessAccessDenied("Organization membership ended.");
    const accountKey = createHash("sha256")
      .update(JSON.stringify([new URL(options.backend).origin, data.user.id]))
      .digest("hex");
    return { accountKey, organizationId, userId: data.user.id, identity: accountKey };
  }

  catalog() {
    const generation = this.generation;
    const pending = (this.cachedCatalog ??= this.readCatalog().then((catalog) => {
      if (generation !== this.generation) throw new Error("Session changed.");
      return catalog;
    }));
    pending.catch(() => {
      if (this.cachedCatalog === pending) this.cachedCatalog = undefined;
    });
    return pending;
  }

  private async readCatalog() {
    const options = this.options;
    const response = await options.fetchAPI(new URL("/api/v1/agents/list", options.backend).href, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      redirect: "error",
    });
    if (deniedStatuses.has(response.status)) {
      this.invalidate();
      throw new HarnessAccessDenied("Catalog access ended.");
    }
    if (!response.ok) throw new Error("Catalog unavailable.");
    const result = catalogSchema.parse(await response.json());
    return result.data;
  }
}

export interface Authorization {
  accountKey: string;
  organizationId: string;
  userId: string;
  identity: string;
}
