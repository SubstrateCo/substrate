import { createHarnessController } from "./harness-controller.ts";
import { fixture } from "./test-support.ts";
import { describe, expect, test } from "bun:test";

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
          request: async (method) => {
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
      harnesses: [
        {
          harness: "codex",
          available: true,
          capabilities: { resume: true, permissions: true, nativeAgents: false },
        },
      ],
    });
  });
  test("rejects renderer-selected organizations before fetching a catalog", async () => {
    const f = fixture();
    expect(f.controller.run("synchronize", "other-org")).rejects.toThrow("Harness unavailable");
    expect(f.catalogRequests()).toBe(0);
    expect(f.directories).toEqual([]);
  });
  test("revokes a running worker when verification is lost", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    f.setSession({
      user: { id: "user-1", emailVerified: false },
      session: { activeOrganizationId: "org-1" },
    });
    expect(
      f.controller.run("execute", { type: "start", organizationId: "org-1", agentId: "agent" }),
    ).rejects.toThrow("Harness unavailable");
    expect(f.disposed()).toBe(1);
    expect(f.calls.map((call) => call.method)).toEqual(["configure"]);
  });
  test("blocks cross-organization commands and closes the worker", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    expect(
      f.controller.run("execute", { type: "start", organizationId: "other-org", agentId: "agent" }),
    ).rejects.toThrow();
    expect(f.disposed()).toBe(1);
    expect(f.calls.length).toBe(1);
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
