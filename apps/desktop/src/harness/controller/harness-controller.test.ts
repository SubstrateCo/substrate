import { createHarnessController } from "./harness-controller.ts";
import { fixture } from "./test-support.ts";
import { describe, expect, test } from "bun:test";

const open = {
  type: "open" as const,
  organizationId: "org-1",
  sessionId: "session-1",
  agentId: "agent-1",
  folder: "main" as const,
  epoch: 0,
  prefix: "",
};

describe("desktop harness authority", () => {
  test("rejects a same-account organization switch during catalog loading before worker creation", async () => {
    const catalogStarted = Promise.withResolvers<void>();
    const catalogGate = Promise.withResolvers<void>();
    let organizationId = "org-1";
    let created = 0;
    const calls: string[] = [];
    const controller = createHarnessController({
      backend: "https://api.example.com",
      accountsDirectory: "accounts",
      fetchAPI: async (url) => {
        if (url.endsWith("/session"))
          return Response.json({
            success: true,
            data: {
              user: { id: "user-1", emailVerified: true },
              session: { activeOrganizationId: organizationId },
            },
          });
        if (url.includes("get-active-member-role")) return Response.json({ role: "member" });
        catalogStarted.resolve();
        await catalogGate.promise;
        return Response.json({ success: true, data: { agents: [] } });
      },
      createWorker: () => {
        created++;
        return {
          request: async (method, ..._args) => {
            calls.push(method);
          },
          dispose: () => {},
        };
      },
    });
    const pending = controller.run("synchronize");
    await catalogStarted.promise;
    organizationId = "org-2";
    catalogGate.resolve();
    expect(pending).rejects.toThrow("Harness unavailable");
    await pending.catch(() => undefined);
    expect(created).toBe(0);
    expect(calls).toEqual([]);
  });
  test("workspace switches keep the account's local MCP worker alive", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    f.setSession({
      user: { id: "user-1", emailVerified: true },
      session: { activeOrganizationId: "org-2" },
    });
    expect(await f.controller.run("synchronize")).toEqual({
      connected: true,
      organizationId: "org-2",
    });
    expect(f.disposed()).toBe(0);
    expect(f.directories).toHaveLength(1);
    expect(f.calls.at(-1)).toEqual({
      method: "configure",
      value: { organizationId: "org-2", agents: [] },
    });
  });
  test("model discovery uses verified organization scope and returns only catalog metadata", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    expect(await f.controller.run("listModels", { harness: "codex" })).toEqual({
      harness: "codex",
      status: "ready",
      models: [{ id: "gpt-native", name: "Native GPT" }],
    });
    expect(f.calls.at(-1)).toEqual({
      method: "listModels",
      value: { harness: "codex", organizationId: "org-1" },
    });
    expect(
      f.controller.run("listModels", { harness: "codex", organizationId: "org-2" }),
    ).rejects.toThrow();
  });
  test("derives account directory and catalog from verified main requests", async () => {
    const f = fixture();
    expect(await f.controller.run("synchronize")).toEqual({
      connected: true,
      organizationId: "org-1",
    });
    expect(f.directories[0]).toMatch(/^accounts[\\/][a-f0-9]{64}$/);
    expect(f.calls).toEqual([
      { method: "configure", value: { organizationId: "org-1", agents: [] } },
    ]);
    expect(await f.controller.run("status")).toEqual({
      connected: true,
      organizationId: "org-1",
      harnesses: [{ harness: "codex", available: true }],
    });
  });
  test("rejects renderer-selected organizations before fetching a catalog", async () => {
    const f = fixture();
    expect(f.controller.run("synchronize", "other-org")).rejects.toThrow(
      "Invalid harness operation",
    );
    expect(f.controller.run("status", {})).rejects.toThrow("Invalid harness operation");
    expect(f.controller.run("scanSkills", {})).rejects.toThrow("Invalid harness operation");
    expect(f.catalogRequests()).toBe(0);
    expect(f.directories).toEqual([]);
  });
  test("concurrent synchronizations share one verified round trip", async () => {
    const f = fixture();
    const results = await Promise.all([
      f.controller.run("synchronize"),
      f.controller.run("synchronize"),
      f.controller.run("synchronize"),
    ]);
    for (const result of results)
      expect(result).toEqual({ connected: true, organizationId: "org-1" });
    // Session and membership checks, the catalog, then one session recheck.
    expect(f.requests()).toEqual(["session", "membership", "catalog", "session"]);
    expect(f.calls.map((call) => call.method)).toEqual(["configure"]);
    await f.controller.run("synchronize");
    expect(f.requests()).toHaveLength(8);
  });
  test("the renderer cannot run session commands", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    expect(f.controller.run("execute", open)).rejects.toThrow("Invalid harness operation");
    expect(f.calls.map((call) => call.method)).toEqual(["configure"]);
  });
  test("session commands verify once per generation and again after refreshAuthority", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    const before = f.requests().length;
    await f.controller.execute(open);
    await f.controller.execute({ ...open, sessionId: "session-2" });
    expect(f.requests()).toHaveLength(before);
    f.controller.refreshAuthority();
    await f.controller.execute(open);
    expect(f.requests().slice(before)).toEqual(["session", "membership"]);
  });
  test("revokes a running worker when re-verification fails", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    f.setSession({
      user: { id: "user-1", emailVerified: false },
      session: { activeOrganizationId: "org-1" },
    });
    f.controller.refreshAuthority();
    expect(f.controller.execute(open)).rejects.toThrow("Harness unavailable");
    await f.controller.execute(open).catch(() => undefined);
    expect(f.disposed()).toBe(1);
    expect(f.calls.map((call) => call.method)).toEqual(["configure"]);
  });
  test("a transient verification failure keeps the worker and its sessions", async () => {
    for (const outage of ["network", "server"] as const) {
      const f = fixture();
      await f.controller.run("synchronize");
      f.setOutage(outage);
      f.controller.refreshAuthority();
      expect(f.controller.execute(open)).rejects.toThrow("Harness unavailable");
      await f.controller.execute(open).catch(() => undefined);
      expect(f.controller.run("synchronize")).rejects.toThrow("Harness unavailable");
      await f.controller.run("synchronize").catch(() => undefined);
      expect(f.controller.run("status")).rejects.toThrow("Harness unavailable");
      await f.controller.run("status").catch(() => undefined);
      expect(f.disposed()).toBe(0);
      f.setOutage(undefined);
      expect(await f.controller.execute(open)).toMatchObject({ id: "session-1" });
      expect(f.directories).toHaveLength(1);
    }
  });
  test("a transient catalog failure keeps the worker", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    f.failCatalog(true);
    expect(f.controller.run("synchronize")).rejects.toThrow("Harness unavailable");
    await f.controller.run("synchronize").catch(() => undefined);
    expect(f.disposed()).toBe(0);
    f.failCatalog(false);
    expect(await f.controller.run("synchronize")).toEqual({
      connected: true,
      organizationId: "org-1",
    });
  });
  test("a stopped worker is replaced at the next synchronization", async () => {
    const f = fixture(undefined, [], { failExecute: "worker-stopped" });
    await f.controller.run("synchronize");
    expect(f.controller.execute(open)).rejects.toMatchObject({ code: "worker-stopped" });
    await f.controller.execute(open).catch(() => undefined);
    expect(f.controller.execute(open)).rejects.toMatchObject({ code: "not-connected" });
    await f.controller.execute(open).catch(() => undefined);
    await f.controller.run("synchronize");
    expect(f.directories).toHaveLength(2);
  });
  test("an account change disposes the worker", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    f.setSession({
      user: { id: "user-2", emailVerified: true },
      session: { activeOrganizationId: "org-1" },
    });
    await f.controller.run("synchronize");
    expect(f.disposed()).toBe(1);
    expect(f.directories).toHaveLength(2);
  });
  test("blocks commands for another organization before the worker", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    expect(f.controller.execute({ ...open, organizationId: "other-org" })).rejects.toMatchObject({
      code: "organization-unavailable",
    });
    expect(f.calls.map((call) => call.method)).toEqual(["configure"]);
  });
  test("closes a previous organization's sessions after the session moved to another one", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    f.setSession({
      user: { id: "user-1", emailVerified: true },
      session: { activeOrganizationId: "org-2" },
    });
    f.controller.refreshAuthority();
    expect(f.controller.execute(open)).rejects.toMatchObject({ code: "organization-unavailable" });
    await f.controller.execute(open).catch(() => undefined);
    await f.controller.closeOrganization("org-1");
    expect(f.calls.at(-1)).toEqual({ method: "closeOrganization", value: "org-1" });
    expect(f.disposed()).toBe(0);
  });
  test("a failed native command reports its code and keeps the worker", async () => {
    const f = fixture(undefined, [], { failExecute: "resume-failed" });
    await f.controller.run("synchronize");
    expect(f.controller.execute(open)).rejects.toMatchObject({ code: "resume-failed" });
    await f.controller.execute(open).catch(() => undefined);
    expect(f.disposed()).toBe(0);
  });
  test("interrupt is not queued behind a pending command", async () => {
    const hold = Promise.withResolvers<void>();
    const scan = Promise.withResolvers<void>();
    const f = fixture(() => scan.promise, [], { holdExecute: hold.promise });
    await f.controller.run("synchronize");
    const opening = f.controller.execute(open);
    const scanning = f.controller.run("scanConfiguration", {
      harness: "codex",
      agentId: "agent-1",
    });
    await Bun.sleep(0);
    expect(
      await f.controller.execute({
        type: "interrupt",
        organizationId: "org-1",
        sessionId: "session-1",
        turnId: crypto.randomUUID(),
      }),
    ).toEqual({ stillQueuedInputIds: [] });
    hold.resolve();
    scan.resolve();
    expect(await opening).toMatchObject({ id: "session-1", resumed: false });
    await scanning;
  });
  test("local tool calls reach the registered handler after validation", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    const local = f.localTools()!;
    const request = {
      tool: "list_helpers" as const,
      sessionId: "session-1",
      organizationId: "org-1",
      agentId: crypto.randomUUID(),
      turn: {
        turnId: crypto.randomUUID(),
        attempt: 1,
        sessionKey: "dm:x",
        origin: null,
        kind: "interactive" as const,
      },
      input: {},
    };
    expect(local(request)).rejects.toThrow("unavailable");
    const received: unknown[] = [];
    f.controller.setLocalToolHandler(async (call) => {
      received.push(call);
      return { success: true, data: { items: [] } };
    });
    expect(await local(request)).toEqual({ success: true, data: { items: [] } });
    expect(local({ ...request, input: { unexpected: true } })).rejects.toThrow();
    expect(received).toEqual([request]);
  });
  test("readProfile reads only the verified organization", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    expect(await f.controller.readProfile("agent-1")).toBe("- Owner prefers mornings.\n");
    expect(f.calls.at(-1)).toEqual({
      method: "readProfile",
      value: { organizationId: "org-1", agentId: "agent-1" },
    });
  });
  test("membership revocation closes the host before any local file operation", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    f.revokeMembership();
    expect(
      f.controller.run("scanConfiguration", { harness: "codex", agentId: "agent-1" }),
    ).rejects.toThrow("Harness unavailable");
    expect(f.disposed()).toBe(1);
    expect(f.calls.map((call) => call.method)).toEqual(["configure"]);
  });
  test("disconnect cancels in-flight synchronization before process creation", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let created = false;
    const controller = createHarnessController({
      backend: "https://api.example.com",
      accountsDirectory: "accounts",
      fetchAPI: async () => {
        await gate;
        return Response.json({
          user: { id: "user", emailVerified: true },
          session: { activeOrganizationId: "org" },
        });
      },
      createWorker: () => {
        created = true;
        throw new Error("Unexpected process");
      },
    });
    const pending = controller.run("synchronize");
    await Promise.resolve();
    controller.disconnect();
    release();
    expect(pending).rejects.toThrow("Harness unavailable");
    expect(created).toBe(false);
  });
});
