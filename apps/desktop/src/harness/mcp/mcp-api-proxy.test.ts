import type { WorkspaceApiRequest, WorkspaceApiResult } from "@substrate/contracts/harness/mcp";

import { createMcpApiProxy } from "./mcp-api-proxy.ts";
import { expect, test } from "bun:test";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous. */

const projects: WorkspaceApiRequest = {
  tool: "list_projects",
  organizationId: "org-a",
  agentId: "ad4f709e-b80e-40f5-80ee-588e1db066e5",
  turn: {
    turnId: "0d6f4c3e-8b4f-4c39-9d7e-3f1c2a5b6e71",
    attempt: 1,
    sessionKey: "dm:9b2c1d4e-5f60-4a71-8b92-c3d4e5f60718",
    origin: { conversationId: "9b2c1d4e-5f60-4a71-8b92-c3d4e5f60718", threadId: null },
    kind: "interactive",
  },
  input: {},
};
const createProject: WorkspaceApiRequest = {
  ...projects,
  tool: "create_task",
  input: { requestId: crypto.randomUUID(), projectId: crypto.randomUUID(), title: "Launch" },
};

/** The server rejects a call whose organization is not the session's active one. */
const workspaceDenied: WorkspaceApiResult = {
  success: false,
  error: {
    code: "WORKSPACE_CHANGED",
    message: "Your active workspace changed. Reload this page to continue.",
  },
};

function fixture() {
  let organizationId = "org-a";
  let active = true;
  let afterRequest = () => {};
  let apiResult: WorkspaceApiResult = { success: true, data: ["project"] };
  const requests: { url: string; init: RequestInit }[] = [];
  const proxy = createMcpApiProxy({
    backend: "https://api.example.com",
    isActive: () => active,
    fetchAPI: async (url, init) => {
      requests.push({ url, init });
      // SAFETY: the proxy sends the parsed WorkspaceApiRequest as the body.
      const body = (await new Response(init.body).json()) as WorkspaceApiRequest;
      const result = body.organizationId === organizationId ? apiResult : workspaceDenied;
      afterRequest();
      return Response.json(result);
    },
  });
  return {
    proxy,
    requests,
    switchWorkspace: () => {
      organizationId = "org-b";
    },
    disconnect: () => {
      active = false;
    },
    afterRequest: (callback: () => void) => {
      afterRequest = callback;
    },
    setResult: (result: WorkspaceApiResult) => {
      apiResult = result;
    },
  };
}

test("a call after a workspace switch tells the agent to start a new run", async () => {
  const f = fixture();
  expect(await f.proxy(projects)).toEqual({ success: true, data: ["project"] });
  f.switchWorkspace();
  expect(await f.proxy(projects)).toEqual({
    success: false,
    error: {
      code: "FORBIDDEN",
      message: "Workspace changed. Start a new agent run in this workspace.",
    },
  });
  // Each call is one request: the server checks the session, so the proxy does not read it.
  expect(f.requests.map(({ url }) => url)).toEqual([
    "https://api.example.com/api/v1/mcp/call",
    "https://api.example.com/api/v1/mcp/call",
  ]);
});

test("calls without a turn context are rejected before the network", async () => {
  const f = fixture();
  const { turn: _turn, ...withoutTurn } = projects;
  // SAFETY: the test sends a request that lacks turn on purpose; the proxy must reject it.
  await expect(f.proxy(withoutTurn as WorkspaceApiRequest)).rejects.toThrow();
  expect(f.requests).toEqual([]);
});

test("mutations use the agent endpoint with lease-bound scope and the turn context", async () => {
  const f = fixture();
  await f.proxy(createProject);
  expect(f.requests[0]?.url).toBe("https://api.example.com/api/v1/mcp/call");
  expect(f.requests[0]?.init.method).toBe("POST");
  expect(await new Response(f.requests[0]?.init.body).json()).toEqual({
    ...createProject,
  });
});

test("callers cannot select an organization in tool input", async () => {
  const f = fixture();
  await expect(f.proxy({ ...projects, input: { organizationId: "org-b" } })).rejects.toThrow();
  expect(f.requests).toEqual([]);
});

test("a disconnected worker generation cannot call the server", async () => {
  const f = fixture();
  f.disconnect();
  await expect(f.proxy(projects)).rejects.toThrow();
  expect(f.requests).toEqual([]);
});

test("a completed write stays after a workspace switch", async () => {
  const f = fixture();
  f.afterRequest(f.switchWorkspace);
  expect(await f.proxy(createProject)).toEqual({ success: true, data: ["project"] });
  expect(f.requests).toHaveLength(1);
});

test("API permission failures pass through without a fallback or retry", async () => {
  const f = fixture();
  const denied: WorkspaceApiResult = {
    success: false,
    error: { code: "FORBIDDEN", message: "Access denied." },
  };
  f.setResult(denied);
  expect(await f.proxy(projects)).toEqual(denied);
  expect(f.requests).toHaveLength(1);
});

test("the explicit result sink receives the verified request and its result before completion", async () => {
  const received: { request: WorkspaceApiRequest; result: WorkspaceApiResult }[] = [];
  const result: WorkspaceApiResult = { success: true, data: { id: "task" } };
  const proxy = createMcpApiProxy({
    backend: "https://api.example.com",
    isActive: () => true,
    fetchAPI: async () => Response.json(result),
    onResult: async (request, value) => {
      await Promise.resolve();
      received.push({ request, result: value });
    },
  });
  expect(await proxy(createProject)).toEqual(result);
  expect(received).toEqual([{ request: createProject, result }]);
});
