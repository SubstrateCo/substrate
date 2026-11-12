import { AgentWorkStore } from "@substrate/client-storage/agent-work";
import type { RealtimeDomain, RealtimeUpdate } from "@substrate/contracts/realtime";

import { DesktopSessionAuthority } from "../session/desktop-session-authority.ts";
import * as runtimeModule from "./runtime/runtime.ts";
import { agentId, organizationId, runtimeFixture } from "./runtime/test-support.ts";
import { createAgentWorkService } from "./service.ts";
import { afterEach, expect, jest, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* oxlint-disable deslop/no-unknown-parameters -- The fake backend answers with untyped JSON bodies, as the real one does. */

const backend = "https://api.example.com";

function gate() {
  const entered = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  return {
    entered: entered.promise,
    release: () => released.resolve(),
    async wait() {
      entered.resolve();
      await released.promise;
    },
  };
}

async function expectUnavailable(service: ReturnType<typeof createAgentWorkService>) {
  // Bun's assertion returns a promise at runtime, despite its synchronous type.
  await Promise.resolve(expect(service.call("agents")).rejects.toThrow("unavailable"));
}

function change(domain: RealtimeDomain): RealtimeUpdate {
  return {
    version: 1,
    type: "change",
    id: crypto.randomUUID(),
    organizationId: "org-1",
    domain,
  };
}

async function settle() {
  for (let index = 0; index < 40; index++) await new Promise((resolve) => setImmediate(resolve));
}

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  jest.useRealTimers();
  await cleanup?.();
  cleanup = undefined;
});

/** The service on a real store with a fake backend that counts requests per path. */
async function serviceFixture() {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "agent-work-service-"));
  const requests: string[] = [];
  /** Paths that answer UNAUTHENTICATED once, as when the session ended. */
  const deniedOnce = new Set<string>();
  let sessionStatus = 200;
  let organizationId = "org-1";
  let userId = "user-1";
  let sessionGate: ReturnType<typeof gate> | undefined;
  let registrationGate: ReturnType<typeof gate> | undefined;
  let closeGate: ReturnType<typeof gate> | undefined;
  const closedOrganizations: string[] = [];
  const registeredOrganizations: string[] = [];
  const pulledOrganizations: string[] = [];
  /** Wakes the next pull returns. */
  const wakes: unknown[] = [];
  const ok = (data: unknown) => Response.json({ success: true, data });
  const serviceOptions = {
    backend,
    installationId: "00000000-0000-4000-8000-0000000000d1",
    device: { name: "Laptop", platform: "win32" },
    accountsDirectory: root,
    notify: () => {},
    harness: {
      synchronize: async () => {},
      execute: async () => {
        throw new Error("No harness in this test.");
      },
      closeOrganization: async (id: string) => {
        closedOrganizations.push(id);
        await closeGate?.wait();
      },
      readProfile: async () => "",
    },
    async fetchAPI(url: string, init: RequestInit) {
      const path = new URL(url).pathname;
      requests.push(path);
      if (deniedOnce.delete(path))
        return Response.json(
          { success: false, error: { code: "UNAUTHENTICATED", message: "Sign in." } },
          { status: 401 },
        );
      if (path === "/api/auth/get-session") {
        const currentOrganization = organizationId;
        const currentUser = userId;
        await sessionGate?.wait();
        if (sessionStatus !== 200) return new Response(null, { status: sessionStatus });
        return Response.json({
          user: { id: currentUser, emailVerified: true },
          session: { activeOrganizationId: currentOrganization },
        });
      }
      if (path === "/api/auth/organization/get-active-member-role")
        return Response.json({ role: "owner" });
      if (path === "/api/v1/agents/list") return ok({ agents: [], runSettings: [] });
      if (path.endsWith("/device/register")) {
        registeredOrganizations.push(organizationId);
        await registrationGate?.wait();
      }
      if (path === "/api/v1/agent-work/needs-you") return ok({ requests: [] });
      if (path.endsWith("/wakes/pull")) {
        pulledOrganizations.push((await new Response(init.body).json()).organizationId);
        return ok(wakes.splice(0));
      }
      if (path.endsWith("/requests/answers")) return ok([]);
      return ok(null);
    },
  };
  const service = createAgentWorkService({
    ...serviceOptions,
    authority: new DesktopSessionAuthority(serviceOptions),
  });
  cleanup = async () => {
    sessionGate?.release();
    registrationGate?.release();
    closeGate?.release();
    await service.stop();
    await rm(root, { recursive: true, force: true });
  };
  return {
    service,
    deniedOnce,
    wakes,
    closedOrganizations,
    registeredOrganizations,
    pulledOrganizations,
    organization(id: string) {
      organizationId = id;
    },
    account(id: string) {
      userId = id;
    },
    holdSession() {
      return (sessionGate = gate());
    },
    holdRegistration() {
      return (registrationGate = gate());
    },
    holdClose() {
      return (closeGate = gate());
    },
    sessionStatus(status: number) {
      sessionStatus = status;
    },
    sessionChecks: () => requests.filter((path) => path === "/api/auth/get-session").length,
    catalogReads: () => requests.filter((path) => path === "/api/v1/agents/list").length,
    memberChecks: () =>
      requests.filter((path) => path === "/api/auth/organization/get-active-member-role").length,
  };
}

test("calls cannot open agent work before start or after stop", async () => {
  const f = await serviceFixture();
  await expectUnavailable(f.service);
  expect(f.sessionChecks()).toBe(0);
  f.service.start();
  await f.service.call("agents");
  await f.service.stop();
  await expectUnavailable(f.service);
});

/** Keep live-turn behavior real while testing the service's session and lifecycle boundary. */
async function liveServiceFixture() {
  const runtime = await runtimeFixture();
  const factory = spyOn(runtimeModule, "createAgentWorkRuntime").mockReturnValueOnce(
    runtime.runtime,
  );
  const f = await serviceFixture();
  const serviceCleanup = cleanup;
  cleanup = async () => {
    factory.mockRestore();
    await serviceCleanup?.();
    await runtime.close();
  };
  f.service.start();
  await f.service.call("agents");
  factory.mockRestore();
  await runtime.message();
  return { ...f, runtime };
}

test("a live local tool still works during slow routine verification", async () => {
  const f = await liveServiceFixture();
  const turn = f.runtime.turns()[0]!;
  jest.useFakeTimers();
  jest.advanceTimersByTime(60_001);
  const pending = f.holdSession();
  const read = f.service.call("agents");
  await pending.entered;
  const result = await f.service.handleLocalTool({
    tool: "list_helpers",
    sessionId: turn.sessionId,
    organizationId,
    agentId,
    input: {},
    turn: turn.context,
  });
  pending.release();
  await read;
  expect(result).toEqual({ success: true, data: { items: [] } });
});

test("a session invalidation blocks old local tools during verification and after denial", async () => {
  const f = await liveServiceFixture();
  const turn = f.runtime.turns()[0]!;
  const request = {
    tool: "list_helpers",
    sessionId: turn.sessionId,
    organizationId,
    agentId,
    input: {},
    turn: turn.context,
  };
  const pending = f.holdSession();
  f.sessionStatus(401);
  f.service.onRealtime(change("session"));
  await pending.entered;
  expect(await f.service.handleLocalTool(request)).toMatchObject({
    success: false,
    error: { code: "UNAVAILABLE" },
  });
  pending.release();
  await expectUnavailable(f.service);
  expect(await f.service.handleLocalTool(request)).toMatchObject({
    success: false,
    error: { code: "UNAVAILABLE" },
  });
});

test("an agents hint during slow verification promptly interrupts a moved live turn", async () => {
  const f = await liveServiceFixture();
  const turn = f.runtime.turns()[0]!;
  jest.useFakeTimers();
  jest.advanceTimersByTime(60_001);
  const pending = f.holdSession();
  const read = f.service.call("agents");
  await pending.entered;
  f.runtime.catalog[0]!.home = false;
  f.service.onRealtime(change("agents"));
  pending.release();
  await read;
  await f.runtime.settle();
  expect(await f.runtime.store.turns.get(turn.turnId)).toMatchObject({
    status: "interrupted",
    interruption: "moved",
  });
  expect(f.runtime.nativeSessions()).toEqual([]);
});

test("stop drains an in-flight verification without opening a runtime", async () => {
  const f = await serviceFixture();
  const pending = f.holdSession();
  f.service.start();
  await pending.entered;
  const stopping = f.service.stop();
  pending.release();
  await stopping;
  await expectUnavailable(f.service);
  expect(f.registeredOrganizations).toEqual([]);
});

test("stop waits for runtime startup and closes it only once", async () => {
  const f = await serviceFixture();
  const pending = f.holdRegistration();
  f.service.start();
  await pending.entered;
  expect(await f.service.handleLocalTool({})).toMatchObject({
    success: false,
    error: { code: "UNAVAILABLE" },
  });
  let stopped = false;
  const first = f.service.stop().then(() => {
    stopped = true;
  });
  const second = f.service.stop();
  await settle();
  expect(stopped).toBe(false);
  pending.release();
  await Promise.all([first, second]);
  expect(f.closedOrganizations).toEqual(["org-1"]);
  await expectUnavailable(f.service);
});

test("start during stop waits for retirement before opening another runtime", async () => {
  const f = await serviceFixture();
  f.service.start();
  await f.service.call("agents");
  await settle();
  const pending = f.holdClose();
  const stopping = f.service.stop();
  await pending.entered;
  f.service.start();
  await expectUnavailable(f.service);
  pending.release();
  await stopping;
  await f.service.call("agents");
  expect(f.registeredOrganizations).toHaveLength(2);
});

test("a session change during verification retries instead of dropping the change", async () => {
  const f = await serviceFixture();
  const pending = f.holdSession();
  f.service.start();
  await pending.entered;
  f.organization("org-2");
  f.service.onRealtime(change("organization"));
  pending.release();
  await f.service.call("agents");
  expect(f.sessionChecks()).toBe(2);
  expect(f.registeredOrganizations).toEqual(["org-2"]);
  expect(f.pulledOrganizations.length).toBeGreaterThan(0);
  expect(f.pulledOrganizations.every((id) => id === "org-2")).toBe(true);
});

test("a completed stop can restart agent work", async () => {
  const f = await serviceFixture();
  f.service.start();
  await f.service.call("agents");
  await f.service.stop();
  f.service.start();
  await f.service.call("agents");
  expect(f.registeredOrganizations).toHaveLength(2);
  expect(f.closedOrganizations).toEqual(["org-1"]);
});

test("an account change retires the old runtime even in the same organization", async () => {
  const f = await serviceFixture();
  f.service.start();
  await f.service.call("agents");
  f.account("user-2");
  f.service.onRealtime(change("session"));
  await f.service.call("agents");
  expect(f.closedOrganizations).toEqual(["org-1"]);
  expect(f.registeredOrganizations).toHaveLength(2);
});

test("another stop cancels a queued restart", async () => {
  const f = await serviceFixture();
  f.service.start();
  await f.service.call("agents");
  const pending = f.holdClose();
  const stopping = f.service.stop();
  await pending.entered;
  f.service.start();
  const cancelled = f.service.stop();
  pending.release();
  await Promise.all([stopping, cancelled]);
  await expectUnavailable(f.service);
  expect(f.registeredOrganizations).toEqual(["org-1"]);
});

test("a workspace change during retirement cannot publish the superseded workspace", async () => {
  const f = await serviceFixture();
  f.service.start();
  await f.service.call("agents");
  const pending = f.holdClose();
  f.organization("org-2");
  f.service.onRealtime(change("organization"));
  await pending.entered;
  expect(await f.service.handleLocalTool({})).toMatchObject({
    success: false,
    error: { code: "UNAVAILABLE" },
  });
  f.organization("org-3");
  f.service.onRealtime(change("organization"));
  pending.release();
  await f.service.call("agents");
  expect(f.registeredOrganizations).toEqual(["org-1", "org-3"]);
  expect(f.closedOrganizations).toEqual(["org-1"]);
  expect(f.pulledOrganizations).not.toContain("org-2");
});

test("stop closes a store whose open completes late without starting its runtime", async () => {
  const f = await serviceFixture();
  const pending = gate();
  const open = AgentWorkStore.open.bind(AgentWorkStore);
  let closed = 0;
  const opening = spyOn(AgentWorkStore, "open").mockImplementationOnce(async (...args) => {
    const store = await open(...args);
    const close = store.close.bind(store);
    spyOn(store, "close").mockImplementation(() => {
      closed++;
      close();
    });
    await pending.wait();
    return store;
  });
  try {
    f.service.start();
    await pending.entered;
    const stopping = f.service.stop();
    pending.release();
    await stopping;
    expect(closed).toBe(1);
    expect(f.registeredOrganizations).toEqual([]);
    await expectUnavailable(f.service);
  } finally {
    pending.release();
    opening.mockRestore();
  }
});

test("a workspace change during store open closes the stale store before replacement", async () => {
  const f = await serviceFixture();
  const pending = gate();
  const open = AgentWorkStore.open.bind(AgentWorkStore);
  let closed = 0;
  const opening = spyOn(AgentWorkStore, "open").mockImplementationOnce(async (...args) => {
    const store = await open(...args);
    const close = store.close.bind(store);
    spyOn(store, "close").mockImplementation(() => {
      closed++;
      close();
    });
    await pending.wait();
    return store;
  });
  try {
    f.service.start();
    await pending.entered;
    f.organization("org-2");
    f.service.onRealtime(change("organization"));
    pending.release();
    await f.service.call("agents");
    expect(closed).toBe(1);
    expect(f.registeredOrganizations).toEqual(["org-2"]);
    expect(f.pulledOrganizations.every((id) => id === "org-2")).toBe(true);
  } finally {
    pending.release();
    opening.mockRestore();
  }
});

test("agent work reuses the verified session until a session, access or organization hint or ready", async () => {
  const f = await serviceFixture();
  f.service.start();
  await f.service.call("agents");
  await settle();
  expect(f.sessionChecks()).toBe(1);

  // Renderer reads and agent-work hints use the session that was already verified.
  for (let index = 0; index < 3; index++) {
    await f.service.call("agents");
    f.service.onRealtime(change("agent-work"));
  }
  await settle();
  expect(f.sessionChecks()).toBe(1);

  for (const domain of ["session", "access", "organization"] as const) {
    f.service.onRealtime(change(domain));
    await f.service.call("agents");
  }
  f.service.onRealtime({ version: 1, type: "ready" });
  await f.service.call("agents");
  await settle();
  expect(f.sessionChecks()).toBe(5);
  expect(f.memberChecks()).toBe(5);
});

test("confirmed session denial blocks access to the previous local runtime", async () => {
  const f = await serviceFixture();
  f.service.start();
  await f.service.call("agents");
  f.sessionStatus(401);
  f.service.onRealtime(change("session"));
  await settle();
  await Promise.resolve(expect(f.service.call("agents")).rejects.toThrow("Sign in"));
});

test("a server outage preserves the recoverable local runtime", async () => {
  const f = await serviceFixture();
  f.service.start();
  const before = await f.service.call("agents");
  f.sessionStatus(503);
  f.service.onRealtime(change("session"));
  await settle();
  expect(await f.service.call("agents")).toEqual(before);
});

test("a server call denied with UNAUTHENTICATED verifies the session again", async () => {
  jest.useFakeTimers();
  const f = await serviceFixture();
  f.service.start();
  await f.service.call("agents");
  await settle();
  expect(f.sessionChecks()).toBe(1);

  f.deniedOnce.add("/api/v1/agent-work/device/wakes/pull");
  f.service.onRealtime(change("agent-work"));
  // Agent-work hints pull after a short window.
  await settle();
  jest.advanceTimersByTime(300);
  await settle();
  expect(f.deniedOnce.size).toBe(0);
  await f.service.call("agents");
  expect(f.sessionChecks()).toBe(2);
});

test("a wake for an unknown agent reads the catalog from the server again", async () => {
  jest.useFakeTimers();
  const f = await serviceFixture();
  f.service.start();
  await f.service.call("agents");
  await settle();
  const before = f.catalogReads();
  expect(before).toBeGreaterThan(0);

  // The server adopts unhomed agents at pull, so the cached catalog may not list this one.
  f.wakes.push({
    id: "wake-1",
    userAgentId: "00000000-0000-4000-8000-0000000000a1",
    source: "owner_message",
    sourceRef: {
      messageId: "00000000-0000-4000-8000-0000000000b1",
      conversationId: "00000000-0000-4000-8000-0000000000c1",
      threadId: null,
      kind: "direct_message",
    },
    sessionKey: "dm:00000000-0000-4000-8000-0000000000c1",
    dedupeKey: "msg:00000000-0000-4000-8000-0000000000b1",
    createdAt: new Date().toISOString(),
    request: null,
  });
  f.service.onRealtime(change("agent-work"));
  await settle();
  jest.advanceTimersByTime(300);
  await settle();
  expect(f.wakes).toHaveLength(0);
  expect(f.catalogReads()).toBe(before + 1);
});
