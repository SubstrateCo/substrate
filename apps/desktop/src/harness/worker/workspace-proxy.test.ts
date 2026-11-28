import type { WorkspaceApiRequest } from "@substrate/contracts/agent-tools/mcp";

import { approvalWaitMs, workspaceRequestTimeoutMs } from "../mcp/request-limits.ts";
import { createWorkspaceProxy } from "./workspace-proxy.ts";
import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { rejects } from "node:assert/strict";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const request: WorkspaceApiRequest = {
  tool: "list_projects",
  organizationId: "org-a",
  agentId: crypto.randomUUID(),
  turn: {
    turnId: crypto.randomUUID(),
    attempt: 1,
  },
  input: {},
};
const decided = { success: true as const, data: { items: [] } };

test("a call that main answers at the end of the approval wait gets main's answer", async () => {
  const posted: number[] = [];
  const proxy = createWorkspaceProxy(({ id }) => posted.push(id));
  const call = proxy.request(request);
  jest.advanceTimersByTime(approvalWaitMs + 5_000);
  proxy.receive({ apiResponse: posted[0]!, result: decided });
  expect(await call).toEqual(decided);
});

test("a call that main never answers fails after the worker's limit", async () => {
  const proxy = createWorkspaceProxy(() => {});
  const call = proxy.request(request);
  jest.advanceTimersByTime(workspaceRequestTimeoutMs);
  await rejects(call, /Request timed out/);
});
