import type { WorkspaceApiRequest, WorkspaceApiResult } from "@startup-os/contracts/harness/mcp";

import { createMcpApiProxy } from "./mcp-api-proxy.ts";
import { expect, test } from "bun:test";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous. */

const projects: WorkspaceApiRequest = { method: "GET", path: "/api/v1/tasks/projects", input: {} };
const createProject: WorkspaceApiRequest = {
  method: "POST",
  path: "/api/v1/tasks/mutations",
  input: { action: "createProject", name: "Launch" },
};

function fixture() {
  let organizationId = "org-a";
  let userId = "user-a";
  let active = true;
  let afterRequest = () => {};
  let apiResult: WorkspaceApiResult = { success: true, data: ["project"] };
  const requests: { url: string; init: RequestInit }[] = [];
  const proxy = createMcpApiProxy({
    backend: "https://api.example.com",
    userId,
    isActive: () => active,
    fetchAPI: async (url, init) => {
      if (url.endsWith("/session"))
        return Response.json({
          success: true,
          data: {
            user: { id: userId, emailVerified: true },
            session: { activeOrganizationId: organizationId },
          },
        });
      requests.push({ url, init });
      afterRequest();
      return Response.json(apiResult);
    },
  });
  return {
    proxy,
    requests,
    switchWorkspace: () => {
      organizationId = "org-b";
    },
    switchAccount: () => {
      userId = "user-b";
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

test("MCP uses the shared API transport and resolves the active organization on every request", async () => {
  const f = fixture();
  expect(await f.proxy(projects)).toEqual({ success: true, data: ["project"] });
  f.switchWorkspace();
  await f.proxy(projects);
  expect(f.requests.map(({ url }) => url)).toEqual([
    "https://api.example.com/api/v1/tasks/projects?organizationId=org-a",
    "https://api.example.com/api/v1/tasks/projects?organizationId=org-b",
  ]);
});

test("mutations use the existing endpoint and inject organization into the JSON body", async () => {
  const f = fixture();
  await f.proxy(createProject);
  expect(f.requests[0]?.url).toBe("https://api.example.com/api/v1/tasks/mutations");
  expect(f.requests[0]?.init.method).toBe("POST");
  expect(await new Response(f.requests[0]?.init.body).json()).toEqual({
    organizationId: "org-a",
    action: "createProject",
    name: "Launch",
  });
});

test("callers cannot select an organization or escape the workspace API", async () => {
  const f = fixture();
  await expect(f.proxy({ ...projects, input: { organizationId: "org-b" } })).rejects.toThrow();
  for (const path of [
    "https://evil.example",
    "/api/auth/sign-out",
    "/api/v1/tasks/../agents/list",
    "/api/v1/tasks/projects?organizationId=org-b",
  ]) {
    await expect(f.proxy({ ...projects, path })).rejects.toThrow();
  }
  expect(f.requests).toEqual([]);
});

test("old credentials cannot cross accounts or survive disconnect", async () => {
  const f = fixture();
  f.switchAccount();
  await expect(f.proxy(projects)).rejects.toThrow();
  f.disconnect();
  await expect(f.proxy(projects)).rejects.toThrow();
  expect(f.requests).toEqual([]);
});

test("a workspace change during a request discards the result without replaying the request", async () => {
  const f = fixture();
  f.afterRequest(f.switchWorkspace);
  await expect(f.proxy(createProject)).rejects.toThrow("Workspace changed");
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
