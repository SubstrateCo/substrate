import { sessionKeys } from "@substrate/contracts/agent-work";
import type { HarnessEventBody } from "@substrate/contracts/harness";
import type { TurnContext, WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";

import { createStartupMcp, type McpLease } from "../mcp.ts";
import { startFakeAgent, type FakeAgent, type FakeAgentScript } from "../testing/fake-agent.ts";
import { createAcpAdapter } from "./adapter.ts";
import type { AcpLaunch, AcpProtocolVersion } from "./api.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const launch: AcpLaunch = { harness: "claude", command: "fake", args: [], version: "1" };
const turn: TurnContext = {
  turnId: "0d6f4c3e-8b4f-4c39-9d7e-3f1c2a5b6e71",
  attempt: 1,
  sessionKey: sessionKeys.dm("9b2c1d4e-5f60-4a71-8b92-c3d4e5f60718"),
  origin: { conversationId: "9b2c1d4e-5f60-4a71-8b92-c3d4e5f60718", threadId: null },
  kind: "interactive",
};
const listProjects = {
  mcp: {
    server: "substrate",
    method: "tools/call",
    params: { name: "list_projects", arguments: {} },
  },
};

let folder: string;
let host: Awaited<ReturnType<typeof createStartupMcp>>;
let calls: WorkspaceApiRequest[];
/** Makes workspace calls never settle, as a stalled server request would. */
let stallWorkspace: boolean;
/** Resolves on the first workspace call. */
let workspaceCalled: PromiseWithResolvers<void>;

beforeEach(async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  folder = await mkdtemp(join(tmpdir(), "opencode", "acp-mcp-test-"));
  calls = [];
  stallWorkspace = false;
  workspaceCalled = Promise.withResolvers<void>();
  host = await createStartupMcp({
    workspace: async (call) => {
      calls.push(call);
      workspaceCalled.resolve();
      if (stallWorkspace) await new Promise<never>(() => {});
      return { success: true, data: { items: [], nextCursor: null } };
    },
  });
});
afterEach(async () => {
  await host.close();
  await rm(folder, { recursive: true, force: true });
});

function issue(): McpLease {
  return host.issue({
    organizationId: "org-a",
    agentId: "agent-a",
    sessionId: "session-a",
    tools: ["list_projects"],
    folder,
    agentFolder: folder,
  });
}

async function open(script: FakeAgentScript, lease: McpLease) {
  let agent: FakeAgent | undefined;
  const adapter = await createAcpAdapter(
    {
      launch,
      prefixChannel: "instructions",
      prefix: "",
      context: {
        directory: folder,
        emit: (_body: HarnessEventBody) => {},
        lease,
      },
    },
    {
      spawn: () => (agent = startFakeAgent(script)),
      cache: new Map<string, AcpProtocolVersion>(),
      commandsWaitMs: 0,
    },
  );
  const fake = agent!;
  return {
    adapter,
    record: fake.record,
    setup: () => fake.record.calls.find((call) => call.method === "session/new")?.params,
    run: () => adapter.turn({ inputIds: ["a"], text: "go" }, { mode: "interactive" }),
  };
}

const toolList = z.object({ result: z.object({ tools: z.array(z.object({ name: z.string() })) }) });
const toolCall = z.object({
  result: z.object({
    isError: z.boolean().optional(),
    structuredContent: z.json().optional(),
    content: z.tuple([z.object({ type: z.literal("text"), text: z.string() })]),
  }),
});

test("an agent that advertises MCP-over-ACP gets the lease's tools over mcp/message during a turn", async () => {
  const lease = issue();
  const f = await open(
    {
      agentCapabilities: { mcpCapabilities: { acp: true } },
      defaultTurn: [{ mcp: { server: "substrate", method: "tools/list" } }, listProjects],
    },
    lease,
  );
  expect(f.setup()).toEqual({
    cwd: folder,
    mcpServers: [{ type: "acp", name: "substrate", serverId: expect.any(String) }],
  });
  lease.bind(turn);
  await f.run();
  lease.unbind();
  const [listed, called] = f.record.mcp;
  expect(toolList.parse(listed).result.tools.map((tool) => tool.name)).toEqual(["list_projects"]);
  expect(toolCall.parse(called).result.structuredContent).toEqual({ items: [], nextCursor: null });
  expect(calls).toEqual([
    {
      tool: "list_projects",
      organizationId: "org-a",
      agentId: "agent-a",
      turn,
      input: { archived: "active", limit: 25 },
    },
  ]);
  await f.adapter.disconnect();
});

test("MCP-over-ACP calls outside a bound turn return NO_TURN and never reach the workspace", async () => {
  const lease = issue();
  const f = await open(
    { agentCapabilities: { mcpCapabilities: { acp: true } }, defaultTurn: [listProjects] },
    lease,
  );
  await f.run();
  const { result } = toolCall.parse(f.record.mcp[0]);
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text)).toMatchObject({ code: "NO_TURN" });
  expect(calls).toEqual([]);
  await f.adapter.disconnect();
});

test("a revoked lease fails the MCP-over-ACP binding, as HTTP answers 401", async () => {
  const lease = issue();
  const f = await open(
    { agentCapabilities: { mcpCapabilities: { acp: true } }, defaultTurn: [listProjects] },
    lease,
  );
  lease.bind(turn);
  lease.revoke();
  await f.run();
  expect(f.record.mcp).toEqual([{ acpError: expect.objectContaining({ code: -33002 }) }]);
  expect(calls).toEqual([]);
  await f.adapter.disconnect();
});

test("disconnect finishes while an MCP-over-ACP request is still in flight", async () => {
  stallWorkspace = true;
  const lease = issue();
  const f = await open(
    { agentCapabilities: { mcpCapabilities: { acp: true } }, defaultTurn: [listProjects] },
    lease,
  );
  lease.bind(turn);
  void f.run();
  await workspaceCalled.promise;
  const outcome = await Promise.race([
    f.adapter.disconnect().then(() => "disconnected"),
    new Promise((resolve) => setTimeout(() => resolve("still waiting"), 8_000)),
  ]);
  expect(outcome).toBe("disconnected");
}, 15_000);

test("disconnect finishes while the agent holds an MCP subscription stream open", async () => {
  const lease = issue();
  const f = await open(
    {
      agentCapabilities: { mcpCapabilities: { acp: true } },
      // Claude Code's MCP client keeps a subscriptions/listen stream open until the server closes.
      defaultTurn: [
        {
          mcp: {
            server: "substrate",
            method: "subscriptions/listen",
            params: { notifications: { toolsListChanged: true } },
          },
        },
      ],
    },
    lease,
  );
  // The provider touches the lease when the subscriptions/listen request reaches it.
  const reached = Promise.withResolvers<void>();
  const endpoint = lease.endpoint!;
  const touch = endpoint.touch.bind(endpoint);
  endpoint.touch = () => {
    reached.resolve();
    return touch();
  };
  void f.run();
  await reached.promise;
  const outcome = await Promise.race([
    f.adapter.disconnect().then(() => "disconnected"),
    new Promise((resolve) => setTimeout(() => resolve("still waiting"), 8_000)),
  ]);
  expect(outcome).toBe("disconnected");
}, 15_000);

test("without MCP-over-ACP the lease is declared over HTTP with its bearer token", async () => {
  const lease = issue();
  const f = await open({ agentCapabilities: { mcpCapabilities: { http: true } } }, lease);
  expect(f.setup()).toEqual({
    cwd: folder,
    mcpServers: [
      {
        type: "http",
        name: "substrate",
        url: lease.url,
        headers: [{ name: "Authorization", value: `Bearer ${lease.token}` }],
      },
    ],
  });
  await f.adapter.disconnect();
});
