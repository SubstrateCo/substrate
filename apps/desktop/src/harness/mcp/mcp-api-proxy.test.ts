import type { WorkspaceApiRequest, WorkspaceApiResult } from "@substrate/contracts/agent-tools/mcp";
import type { ProposalOutcome } from "@substrate/contracts/agent-work";

import { createMcpApiProxy } from "./mcp-api-proxy.ts";
import { approvalPollMs, approvalWaitMs, workspaceRequestTimeoutMs } from "./request-limits.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

const projects: WorkspaceApiRequest = {
  tool: "list_projects",
  organizationId: "org-a",
  agentId: "ad4f709e-b80e-40f5-80ee-588e1db066e5",
  turn: {
    turnId: "0d6f4c3e-8b4f-4c39-9d7e-3f1c2a5b6e71",
    attempt: 1,
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
  await rejects(f.proxy(withoutTurn as WorkspaceApiRequest), Error);
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
  await rejects(f.proxy({ ...projects, input: { organizationId: "org-b" } }), Error);
  expect(f.requests).toEqual([]);
});

test("a disconnected worker generation cannot call the server", async () => {
  const f = fixture();
  f.disconnect();
  await rejects(f.proxy(projects), Error);
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

const proposalId = "6a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const pending: WorkspaceApiResult = {
  success: false,
  error: { code: "APPROVAL_PENDING", message: "Waiting for approval.", requestId: proposalId },
};
const deleteTask: WorkspaceApiRequest = {
  ...projects,
  tool: "delete_task",
  input: { requestId: crypto.randomUUID(), taskId: crypto.randomUUID() },
};
const deleted = { deleted: true, taskId: crypto.randomUUID() };
const executed: ProposalOutcome = {
  status: "executed",
  receipt: { kind: "deleted", entityType: "task", id: deleted.taskId },
  result: deleted,
};

/**
 * A proxy whose call waits for approval. states are the request's reads in order; the last one
 * repeats. The clock moves only when the proxy sleeps, so no test waits in real time. Only an
 * interactive live turn waits.
 */
function held(
  states: { status: string; outcome: ProposalOutcome | null }[],
  serverMs = 0,
  interactive = true,
) {
  let now = 0;
  const reads: number[] = [];
  const waits: string[] = [];
  const released: string[] = [];
  const received: { result: WorkspaceApiResult; decided?: { requestId: string } }[] = [];
  const proxy = createMcpApiProxy({
    backend: "https://api.example.com",
    isActive: () => true,
    fetchAPI: async () => {
      now += serverMs;
      return Response.json(pending, { status: 202 });
    },
    approval: {
      async status(organizationId, requestId) {
        expect({ organizationId, requestId }).toEqual({
          organizationId: "org-a",
          requestId: proposalId,
        });
        reads.push(now);
        return states[Math.min(reads.length - 1, states.length - 1)]!;
      },
      waiting(_request, requestId) {
        if (!interactive) return null;
        waits.push(requestId);
        return () => released.push(requestId);
      },
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
      now: () => now,
    },
    onResult: (_request, result, decided) => {
      received.push(decided ? { result, decided } : { result });
    },
  });
  return { proxy, reads, waits, released, received, elapsed: () => now };
}
const undecided = { status: "pending", outcome: null };

test("an interactive call that needs approval waits and returns the executed tool result", async () => {
  const f = held([undecided, undecided, { status: "executed", outcome: executed }]);
  expect(await f.proxy(deleteTask)).toEqual({ success: true, data: deleted });
  expect(f.reads).toEqual([0, approvalPollMs, 2 * approvalPollMs]);
  expect(f.received).toEqual([
    { result: { success: true, data: deleted }, decided: { requestId: proposalId } },
  ]);
  expect(f.waits).toEqual([proposalId]);
  expect(f.released).toEqual([proposalId]);
});

test("a declined or failed decision is the final result and says not to retry", async () => {
  expect(
    await held([{ status: "resolved", outcome: { status: "declined" } }]).proxy(deleteTask),
  ).toEqual({
    success: false,
    error: { code: "DECLINED", message: "Your owner declined this call. Do not retry it." },
  });
  const failed = held([{ status: "failed", outcome: { status: "failed", error: "Task gone." } }]);
  expect(await failed.proxy(deleteTask)).toEqual({
    success: false,
    error: { code: "FAILED", message: "Task gone." },
  });
  expect(failed.received[0]?.decided).toEqual({ requestId: proposalId });
});

test("an executed result that does not match the tool's output is not passed on", async () => {
  const f = held([{ status: "executed", outcome: { ...executed, result: { unexpected: 1 } } }]);
  const result = await f.proxy(deleteTask);
  expect(result.success ? null : result.error.code).toBe("RESULT_UNAVAILABLE");
});

test("an undecided call returns APPROVAL_PENDING unchanged after the wait, within 60 s", async () => {
  const f = held([undecided]);
  expect(await f.proxy(deleteTask)).toEqual(pending);
  expect(f.reads.at(-1)).toBeLessThanOrEqual(approvalWaitMs);
  expect(workspaceRequestTimeoutMs).toBeLessThanOrEqual(60_000);
  expect(f.received).toEqual([{ result: pending }]);
  expect(f.released).toEqual([proposalId]);
  const expired = held([{ status: "expired", outcome: null }]);
  expect(await expired.proxy(deleteTask)).toEqual(pending);
  expect(expired.reads).toHaveLength(1);
});

test("a slow server call counts against the wait, so main answers before the worker gives up", async () => {
  const f = held([undecided], 20_000);
  expect(await f.proxy(deleteTask)).toEqual(pending);
  expect(f.reads[0]).toBe(20_000);
  expect(f.elapsed()).toBeLessThanOrEqual(approvalWaitMs);
});

test("an unattended call never waits, but a retry of a decided call gets the decision", async () => {
  const open = held([undecided, { status: "executed", outcome: executed }], 0, false);
  expect(await open.proxy(deleteTask)).toEqual(pending);
  expect(open.reads).toEqual([0]);
  expect(open.waits).toEqual([]);
  const retried = held([{ status: "executed", outcome: executed }], 0, false);
  expect(await retried.proxy(deleteTask)).toEqual({ success: true, data: deleted });
  expect(retried.received[0]?.decided).toEqual({ requestId: proposalId });
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
