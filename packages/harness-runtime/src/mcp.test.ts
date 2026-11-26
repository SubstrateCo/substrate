import { sessionKeys } from "@substrate/contracts/agent-work";
import type {
  LocalToolRequest,
  TurnContext,
  WorkspaceApiRequest,
} from "@substrate/contracts/harness/mcp";
import { leaseTools, type McpToolName } from "@substrate/contracts/harness/tools";

import { createStartupMcp, type McpLeaseOptions, type StartupMcpHandlers } from "./mcp.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const agentId = "ad4f709e-b80e-40f5-80ee-588e1db066e5";
const turn: TurnContext = {
  turnId: "0d6f4c3e-8b4f-4c39-9d7e-3f1c2a5b6e71",
  attempt: 1,
  sessionKey: sessionKeys.dm("9b2c1d4e-5f60-4a71-8b92-c3d4e5f60718"),
  origin: { conversationId: "9b2c1d4e-5f60-4a71-8b92-c3d4e5f60718", threadId: null },
  kind: "interactive",
};
let folder: string;

beforeEach(async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  folder = await mkdtemp(join(tmpdir(), "opencode", "mcp-test-"));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function leaseOptions(overrides: Partial<McpLeaseOptions> = {}): McpLeaseOptions {
  return {
    organizationId: "org-a",
    agentId,
    sessionId: "session-a",
    tools: leaseTools("main", ["messages", "agents", "tasks", "crm"]),
    folder,
    agentFolder: folder,
    ...overrides,
  };
}

async function connected(handlers: StartupMcpHandlers, options = leaseOptions()) {
  const host = await createStartupMcp(handlers);
  const lease = host.issue(options);
  const client = new Client({ name: "mcp-test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(lease.url), {
      requestInit: { headers: { Authorization: `Bearer ${lease.token}` } },
    }),
  );
  return {
    host,
    lease,
    client,
    async close() {
      await client.close();
      await host.close();
    },
  };
}

function text(result: Awaited<ReturnType<Client["callTool"]>>) {
  // SAFETY: this server returns every result as a single text content block.
  const [content] = result.content as { type: "text"; text: string }[];
  return content!.text;
}

test("initialization explains discovery without embedding tool schemas or expanding the lease", async () => {
  const mcp = await connected({}, leaseOptions({ tools: ["list_projects"] }));
  try {
    const instructions = mcp.client.getInstructions();
    expect(instructions).toContain("discover");
    expect(instructions).toContain("skills");
    expect(instructions!.length).toBeLessThan(1024);
    const tools = (await mcp.client.listTools()).tools;
    expect(tools.map((tool) => tool.name)).toEqual(["list_projects"]);
    expect(instructions).not.toContain(JSON.stringify(tools[0]!.inputSchema));
    mcp.lease.bind(turn);
    expect((await mcp.client.callTool({ name: "reply", arguments: {} })).isError).toBe(true);
  } finally {
    await mcp.close();
  }
});

test("server calls carry lease identity and the bound turn; calls outside a turn are rejected", async () => {
  const calls: WorkspaceApiRequest[] = [];
  const mcp = await connected({
    workspace: async (call) => {
      calls.push(call);
      return { success: true, data: { items: [], nextCursor: null } };
    },
  });
  try {
    const outside = await mcp.client.callTool({ name: "list_projects", arguments: {} });
    expect(outside.isError).toBe(true);
    expect(JSON.parse(text(outside))).toMatchObject({ code: "NO_TURN" });
    expect(calls).toEqual([]);

    mcp.lease.bind(turn);
    expect(
      (await mcp.client.callTool({ name: "list_projects", arguments: {} })).structuredContent,
    ).toEqual({ items: [], nextCursor: null });
    expect(calls).toEqual([
      {
        tool: "list_projects",
        organizationId: "org-a",
        agentId,
        turn,
        input: { archived: "active", limit: 25 },
      },
    ]);

    mcp.lease.unbind();
    expect((await mcp.client.callTool({ name: "list_projects", arguments: {} })).isError).toBe(
      true,
    );
    expect(calls).toHaveLength(1);
  } finally {
    await mcp.close();
  }
});

test("CRM tools use the native lease and reject input identity spoofing before forwarding", async () => {
  const calls: WorkspaceApiRequest[] = [];
  const mcp = await connected({
    workspace: async (call) => {
      calls.push(call);
      return { success: true, data: { items: [], nextAfterEntityId: null } };
    },
  });
  try {
    const listed = new Map((await mcp.client.listTools()).tools.map((tool) => [tool.name, tool]));
    expect(listed.get("list_crm_records")?.annotations?.readOnlyHint).toBe(true);
    expect(listed.get("create_crm_deal")?.annotations).toMatchObject({
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    const outside = await mcp.client.callTool({
      name: "list_crm_records",
      arguments: { kind: "account" },
    });
    expect(JSON.parse(text(outside))).toMatchObject({ code: "NO_TURN" });
    mcp.lease.bind(turn);
    const spoofed = await mcp.client.callTool({
      name: "list_crm_records",
      arguments: { kind: "account", organizationId: "other-org", turn },
    });
    expect(spoofed.isError).toBe(true);
    expect(calls).toEqual([]);
    await mcp.client.callTool({
      name: "list_crm_records",
      arguments: { kind: "account", search: "Customer" },
    });
    expect(calls).toEqual([
      {
        tool: "list_crm_records",
        organizationId: "org-a",
        agentId,
        turn,
        input: { kind: "account", search: "Customer", archived: "active" },
      },
    ]);
  } finally {
    await mcp.close();
  }
});

test("local tools route to the desktop handler with the session and turn", async () => {
  const calls: LocalToolRequest[] = [];
  const mcp = await connected({
    local: async (call) => {
      calls.push(call);
      return { success: true, data: { items: [] } };
    },
  });
  try {
    mcp.lease.bind(turn);
    await mcp.client.callTool({ name: "list_helpers", arguments: {} });
    expect(calls).toEqual([
      {
        tool: "list_helpers",
        sessionId: "session-a",
        organizationId: "org-a",
        agentId,
        turn,
        input: {},
      },
    ]);
  } finally {
    await mcp.close();
  }
});

test("memory tools are handled locally and never reach either proxy", async () => {
  let proxied = 0;
  const mcp = await connected({
    workspace: async () => {
      proxied++;
      return { success: true, data: {} };
    },
    local: async () => {
      proxied++;
      return { success: true, data: {} };
    },
  });
  try {
    mcp.lease.bind(turn);
    const result = await mcp.client.callTool({
      name: "remember",
      arguments: { layer: "profile", text: "Owner prefers short replies." },
    });
    expect(result.structuredContent).toEqual({ layer: "profile", saved: true });
    expect(await readFile(join(folder, "memory", "profile.md"), "utf8")).toBe(
      "- Owner prefers short replies.\n",
    );
    expect(proxied).toBe(0);
  } finally {
    await mcp.close();
  }
});

test("helper leases offer no publishing, helper management or memory tools", async () => {
  const mcp = await connected(
    {},
    leaseOptions({ tools: leaseTools("helper", ["messages", "agents", "tasks", "crm"]) }),
  );
  try {
    const names = new Set((await mcp.client.listTools()).tools.map((tool) => tool.name));
    for (const name of ["reply", "start_helper", "remember", "forget"] satisfies McpToolName[])
      expect(names.has(name)).toBe(false);
    expect(names.has("finish_helper")).toBe(true);
  } finally {
    await mcp.close();
  }
});

test("a discovered tool cannot run after its session lease is revoked", async () => {
  const calls: WorkspaceApiRequest[] = [];
  const mcp = await connected({
    workspace: async (call) => {
      calls.push(call);
      return { success: true, data: { items: [], nextCursor: null } };
    },
  });
  try {
    const tools = (await mcp.client.listTools()).tools;
    expect(tools.some((tool) => tool.name === "list_projects")).toBe(true);
    mcp.lease.bind(turn);
    mcp.lease.revoke();
    await rejects(mcp.client.callTool({ name: "list_projects", arguments: {} }));
    expect(calls).toEqual([]);
  } finally {
    await mcp.close();
  }
});

test("results above the offload limit are written inside the folder and returned as a reference", async () => {
  const items = Array.from({ length: 200 }, (_, index) => ({
    id: crypto.randomUUID(),
    name: `Project ${index} ${"x".repeat(40)}`,
    archived: false,
  }));
  const mcp = await connected({
    workspace: async () => ({ success: true, data: { items, nextCursor: null } }),
  });
  try {
    mcp.lease.bind(turn);
    const result = await mcp.client.callTool({ name: "list_projects", arguments: {} });
    const path = `.substrate/outputs/${turn.turnId}/list_projects-1.json`;
    expect(result.structuredContent).toMatchObject({ truncated: true, path });
    expect(JSON.parse(await readFile(join(folder, path), "utf8"))).toEqual({
      items,
      nextCursor: null,
    });
    expect(await readdir(join(folder, ".substrate", "outputs", turn.turnId))).toEqual([
      "list_projects-1.json",
    ]);
  } finally {
    await mcp.close();
  }
});

const fileInput = {
  type: "message_attachment",
  messageId: "5a9f2d61-0b4e-4c1a-9d3f-7e8a6b5c4d21",
  attachmentId: "7c1e3b52-9a4d-4f60-8e2b-1d0c9f8a7b63",
} as const;
const fileMetadata = { file: fileInput, filename: "bug.png", contentType: "image/png", size: 9 };

test("an image from read_file reaches the model as an image block, not as offloaded JSON", async () => {
  // Large enough that the generic path would offload it to a file.
  const data = Buffer.alloc(32 * 1024, 7).toString("base64");
  const mcp = await connected({
    workspace: async () => ({
      success: true,
      data: { ...fileMetadata, content: { kind: "image", mimeType: "image/webp", data } },
    }),
  });
  try {
    mcp.lease.bind(turn);
    const result = await mcp.client.callTool({ name: "read_file", arguments: { file: fileInput } });
    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({
          ...fileMetadata,
          content: { kind: "image", mimeType: "image/webp" },
        }),
      },
      { type: "image", data, mimeType: "image/webp" },
    ]);
    expect(await readdir(folder)).toEqual([]);
  } finally {
    await mcp.close();
  }
});

test("download_file writes the bytes inside the folder and returns only the path", async () => {
  const bytes = Buffer.from("%PDF-1.7 report");
  const mcp = await connected({
    workspace: async () => ({
      success: true,
      data: { ...fileMetadata, filename: "../Q3 report?.pdf", data: bytes.toString("base64") },
    }),
  });
  try {
    mcp.lease.bind(turn);
    const result = await mcp.client.callTool({
      name: "download_file",
      arguments: { file: fileInput },
    });
    const path = `.substrate/files/${turn.turnId}/${fileInput.attachmentId}-_Q3 report_.pdf`;
    expect(result.structuredContent).toEqual({
      ...fileMetadata,
      filename: "../Q3 report?.pdf",
      path,
    });
    expect(text(result)).not.toContain(bytes.toString("base64"));
    expect(await readFile(join(folder, path))).toEqual(bytes);
  } finally {
    await mcp.close();
  }
});

test("the native Meetings lease exposes the tools and keeps a large private source page out of the shared agent folder", async () => {
  const input = {
    meetingId: crypto.randomUUID(),
    sourceId: crypto.randomUUID(),
    section: "transcript",
  };
  const page = {
    text: "🎙".repeat(3000),
    speaker: null,
    offsetMs: null,
    nextOffset: 3000,
    nextTurn: null,
  };
  const calls: WorkspaceApiRequest[] = [];
  const mcp = await connected(
    {
      workspace: async (call) => {
        calls.push(call);
        return { success: true, data: page };
      },
    },
    leaseOptions({ tools: leaseTools("main", ["meetings"]) }),
  );
  try {
    const offered = (await mcp.client.listTools()).tools.filter((t) => t.name.includes("meeting"));
    expect(offered.map((t) => t.name).sort()).toEqual([
      "create_meeting",
      "get_meeting",
      "list_meetings",
      "read_meeting_source",
    ]);
    expect(offered.find((t) => t.name === "create_meeting")?.annotations).toMatchObject({
      readOnlyHint: false,
      idempotentHint: true,
    });
    mcp.lease.bind(turn);
    expect(
      (await mcp.client.callTool({ name: "read_meeting_source", arguments: input }))
        .structuredContent,
    ).toEqual(page);
    expect(calls).toEqual([
      {
        tool: "read_meeting_source",
        organizationId: "org-a",
        agentId,
        turn,
        input: { ...input, turn: 0, offset: 0 },
      },
    ]);
    expect(await readdir(folder)).toEqual([]);
  } finally {
    await mcp.close();
  }
});

test("Inbox discovery advertises read-only tools; an oversized private result is never written to the agent folder", async () => {
  const messageId = crypto.randomUUID();
  const mcp = await connected(
    {
      local: async () => ({
        success: true,
        data: {
          messageId,
          mailboxId: crypto.randomUUID(),
          mailbox: "Work",
          subject: "Renewal",
          from: "Alex",
          to: "Owner",
          date: new Date().toISOString(),
          unread: true,
          text: "💌".repeat(3000),
          truncated: false,
          nextOffset: null,
          coverage: "gmail",
        },
      }),
    },
    leaseOptions({ tools: leaseTools("main", ["inbox"]) }),
  );
  try {
    const tools = new Map((await mcp.client.listTools()).tools.map((tool) => [tool.name, tool]));
    for (const name of ["search_inbox", "read_inbox_message"])
      expect(tools.get(name)?.annotations?.readOnlyHint).toBe(true);
    mcp.lease.bind(turn);
    const result = await mcp.client.callTool({
      name: "read_inbox_message",
      arguments: { messageId },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).not.toContain("💌");
    expect(await readdir(folder)).toEqual([]);
  } finally {
    await mcp.close();
  }
});

test("API failures reach the agent with their message and a next step", async () => {
  const mcp = await connected({
    workspace: async () => ({
      success: false,
      error: { code: "FORBIDDEN", message: "Workspace changed. Start a new agent run." },
    }),
  });
  try {
    mcp.lease.bind(turn);
    const result = await mcp.client.callTool({ name: "list_projects", arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.parse(text(result))).toMatchObject({
      code: "FORBIDDEN",
      message: "Workspace changed. Start a new agent run.",
      hint: expect.stringContaining("start a new run"),
    });
    const tools = new Map((await mcp.client.listTools()).tools.map((tool) => [tool.name, tool]));
    expect(tools.get("update_task")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  } finally {
    await mcp.close();
  }
});

test("loopback MCP rejects revoked, browser and rebound requests", async () => {
  const host = await createStartupMcp();
  const lease = host.issue(leaseOptions());
  try {
    const headers = { Authorization: `Bearer ${lease.token}` };
    const forbidden = await fetch(lease.url, {
      method: "POST",
      headers: { ...headers, Origin: "https://evil.example" },
      body: "{}",
    });
    expect(forbidden.status).toBe(403);
    const rebound = await fetch(lease.url, {
      method: "POST",
      headers: { ...headers, Host: "evil.example" },
      body: "{}",
    });
    expect(rebound.status).toBe(403);
    const anonymous = await fetch(lease.url, { method: "POST", body: "{}" });
    expect(anonymous.status).toBe(401);
    lease.revoke();
    const revoked = await fetch(lease.url, { method: "POST", headers, body: "{}" });
    expect(revoked.status).toBe(401);
  } finally {
    await host.close();
  }
});

test("APP_DISABLED tells a stale native session to stop rather than retry", async () => {
  const mcp = await connected({
    workspace: async () => ({
      success: false,
      error: { code: "APP_DISABLED", message: "Tasks is disabled." },
    }),
  });
  try {
    mcp.lease.bind(turn);
    const result = await mcp.client.callTool({ name: "list_projects", arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.parse(text(result))).toMatchObject({
      code: "APP_DISABLED",
      hint: expect.stringContaining("Do not retry"),
    });
  } finally {
    await mcp.close();
  }
});

test("APPROVAL_PENDING returns the proposal's requestId and tells the agent not to retry", async () => {
  const requestId = "5f0c3a2e-7b1d-4e6f-9a8b-0c1d2e3f4a5b";
  const mcp = await connected({
    workspace: async () => ({
      success: false,
      error: { code: "APPROVAL_PENDING", message: "Waiting for owner approval.", requestId },
    }),
  });
  try {
    mcp.lease.bind(turn);
    const result = await mcp.client.callTool({
      name: "delete_project",
      arguments: { requestId: crypto.randomUUID(), projectId: crypto.randomUUID() },
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(text(result))).toMatchObject({
      code: "APPROVAL_PENDING",
      requestId,
      hint: expect.stringContaining("Do not retry or work around it"),
    });
  } finally {
    await mcp.close();
  }
});

test("a lease never expires under a bound turn and expires only after it stays unbound", async () => {
  const host = await createStartupMcp(
    { workspace: async () => ({ success: true, data: { items: [], nextCursor: null } }) },
    { leaseTtlMs: 60_000 },
  );
  const lease = host.issue(leaseOptions());
  const client = new Client({ name: "mcp-test", version: "1" });
  // Moves Date.now() only; the HTTP server keeps its real timers.
  const start = Date.now();
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(lease.url), {
        requestInit: { headers: { Authorization: `Bearer ${lease.token}` } },
      }),
    );
    lease.bind(turn);
    setSystemTime(start + 120_000);
    expect((await client.callTool({ name: "list_projects", arguments: {} })).isError).toBeFalsy();
    lease.unbind();
    setSystemTime(start + 240_000);
    const expired = await fetch(lease.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${lease.token}` },
      body: "{}",
    });
    expect(expired.status).toBe(401);
  } finally {
    setSystemTime();
    await client.close();
    await host.close();
  }
});

test("MCP rejects malformed authorization without accepting bare tokens or crashing", async () => {
  const host = await createStartupMcp();
  const lease = host.issue(leaseOptions());
  try {
    for (const authorization of [lease.token, `Bearer ${"é".repeat(64)}`, `Basic ${lease.token}`]) {
      const response = await fetch(lease.url, {
        method: "POST",
        headers: { Authorization: authorization },
        body: "{}",
      });
      expect(response.status).toBe(401);
    }
  } finally {
    await host.close();
  }
});
