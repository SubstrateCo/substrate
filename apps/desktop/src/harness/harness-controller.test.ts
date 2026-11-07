import {
  parseHarnessCommand,
  parseLocalConfiguration,
  trustedHarnessSender,
} from "./harness-bridge.ts";
import { createHarnessController } from "./harness-controller.ts";
import { describe, expect, test } from "bun:test";

function fixture(beforeScan?: () => Promise<void>, nativeMcpServers: unknown[] = []) {
  let session = {
    user: { id: "user-1", emailVerified: true },
    session: { activeOrganizationId: "org-1" },
  };
  let catalogRequests = 0;
  const calls: { method: string; value?: unknown }[] = [];
  const directories: string[] = [];
  let disposed = 0;
  let membership = true;
  const controller = createHarnessController({
    backend: "https://api.example.com",
    accountsDirectory: "accounts",
    fetchAPI: async (url) => {
      if (url.endsWith("/session")) return Response.json({ success: true, data: session });
      if (url.includes("get-active-member-role"))
        return membership ? Response.json({ role: "member" }) : new Response(null, { status: 403 });
      catalogRequests++;
      return Response.json({ success: true, data: { agents: [] } });
    },
    createWorker: (directory) => {
      directories.push(directory);
      return {
        request: async (method, value) => {
          calls.push({ method, value });
          if (method === "listModels")
            return {
              harness: "codex",
              status: "ready",
              models: [{ id: "gpt-native", name: "Native GPT", credentials: "must-not-cross-ipc" }],
              stderr: "must-not-cross-ipc",
            };
          if (method === "scanConfiguration") {
            await beforeScan?.();
            return {
              organizationId: "org-1",
              harness: "codex",
              skills: [],
              mcpServers: nativeMcpServers,
            };
          }
          return method === "inspect"
            ? [
                {
                  harness: "codex",
                  executable: "secret-path",
                  available: true,
                  capabilities: { resume: true, permissions: true, nativeAgents: false },
                },
              ]
            : undefined;
        },
        dispose: () => {
          disposed++;
        },
      };
    },
  });
  return {
    controller,
    calls,
    directories,
    setSession: (value: typeof session) => {
      session = value;
    },
    catalogRequests: () => catalogRequests,
    disposed: () => disposed,
    revokeMembership: () => {
      membership = false;
    },
  };
}

describe("desktop harness authority", () => {
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
    expect(f.controller.run("scanConfiguration", { harness: "codex" })).rejects.toThrow(
      "Harness unavailable",
    );
    expect(f.disposed()).toBe(1);
    expect(f.calls.map((call) => call.method)).toEqual(["configure"]);
  });
  test("local file operations use the verified active organization", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    const input = {
      harness: "codex",
      id: "notes",
      name: "Notes",
      description: "",
      content: "Keep notes.",
    };
    await f.controller.run("saveSkill", input);
    expect(f.calls.at(-1)).toEqual({
      method: "saveSkill",
      value: {
        organizationId: "org-1",
        harness: "codex",
        skill: { id: "notes", name: "Notes", description: "", content: "Keep notes." },
      },
    });
    expect(
      f.controller.run("deleteSkill", {
        organizationId: "other-org",
        harness: "codex",
        id: "notes",
      }),
    ).rejects.toThrow();
    expect(f.calls.length).toBe(2);
  });
  test("new native configuration uses stable names instead of random database-style IDs", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    await f.controller.run("saveSkill", {
      harness: "opencode",
      name: "review-context",
      description: "Review context.",
      content: "Read the sources.",
    });
    expect(f.calls.at(-1)?.value).toMatchObject({ skill: { id: "review-context" } });
    await f.controller.run("saveMcpServer", {
      harness: "opencode",
      name: "local-helper",
      transport: "stdio",
      command: "node",
      args: ["helper.mjs"],
    });
    expect(f.calls.at(-1)?.value).toMatchObject({ server: { id: "local-helper" } });
  });
  test("native scan results omit transport-inapplicable fields and private metadata", async () => {
    const f = fixture(undefined, [
      {
        id: "local-helper",
        name: "local-helper",
        transport: "stdio",
        command: "node",
        args: ["helper.mjs"],
        url: undefined,
        sourcePath: "private-native-path",
      },
    ]);
    await f.controller.run("synchronize");
    expect(await f.controller.run("scanConfiguration", { harness: "codex" })).toEqual({
      organizationId: "org-1",
      harness: "codex",
      skills: [],
      mcpServers: [
        {
          id: "local-helper",
          name: "local-helper",
          transport: "stdio",
          command: "node",
          args: ["helper.mjs"],
        },
      ],
    });
  });
  test("a scan cannot return private configuration after sign-out", async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scanning = new Promise<void>((resolve) => {
      started = resolve;
    });
    const f = fixture(async () => {
      started();
      await gate;
    });
    await f.controller.run("synchronize");
    const result = f.controller.run("scanConfiguration", { harness: "codex" });
    await scanning;
    f.controller.disconnect();
    release();
    // oxlint-disable-next-line typescript/await-thenable -- Bun's rejects matchers return a promise at runtime.
    await expect(result).rejects.toThrow("Harness unavailable");
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

test("IPC rejects subframes, other windows, and untrusted origins", () => {
  const mainFrame = { url: "https://desktop.example.com/settings" };
  const contents = { mainFrame };
  expect(
    trustedHarnessSender(
      { sender: contents, senderFrame: mainFrame },
      contents,
      "https://desktop.example.com",
    ),
  ).toBe(true);
  expect(
    trustedHarnessSender(
      { sender: contents, senderFrame: { url: mainFrame.url } },
      contents,
      "https://desktop.example.com",
    ),
  ).toBe(false);
  expect(
    trustedHarnessSender(
      { sender: {}, senderFrame: mainFrame },
      contents,
      "https://desktop.example.com",
    ),
  ).toBe(false);
  mainFrame.url = "https://attacker.example.com";
  expect(
    trustedHarnessSender(
      { sender: contents, senderFrame: mainFrame },
      contents,
      "https://desktop.example.com",
    ),
  ).toBe(false);
});

test("commands cannot smuggle paths or catalog configuration", () => {
  expect(() =>
    parseHarnessCommand({
      type: "start",
      organizationId: "org",
      agentId: "agent",
      cwd: "C:/other",
    }),
  ).toThrow();
  expect(() =>
    parseHarnessCommand({ type: "configure", organizationId: "org", agents: [] }),
  ).toThrow();
  expect(() =>
    parseHarnessCommand({
      type: "prompt",
      organizationId: "org",
      sessionId: "session",
      text: "x".repeat(100_001),
    }),
  ).toThrow();
});

test("local configuration rejects paths, traversal, and embedded credentials", () => {
  expect(() =>
    parseLocalConfiguration("deleteSkill", {
      organizationId: "org",
      harness: "codex",
      id: "../notes",
    }),
  ).toThrow();
  expect(() =>
    parseLocalConfiguration("scanConfiguration", {
      organizationId: "org",
      harness: "codex",
      directory: "C:/other",
    }),
  ).toThrow();
  expect(() =>
    parseLocalConfiguration("saveMcpServer", {
      organizationId: "org",
      harness: "codex",
      server: {
        id: "server",
        name: "Server",
        transport: "stdio",
        command: "server",
        environment: { API_KEY: "secret" },
      },
    }),
  ).toThrow();
  expect(() =>
    parseLocalConfiguration("saveMcpServer", {
      organizationId: "org",
      harness: "codex",
      server: {
        id: "server",
        name: "Server",
        transport: "http",
        url: "https://user:password@example.com",
      },
    }),
  ).toThrow();
});
