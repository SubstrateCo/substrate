import type { ToolCallResult } from "@substrate/contracts/harness-runtime";

import { createStartupMcp, type McpLeaseOptions } from "./mcp.ts";
import {
  testHint,
  testServer,
  testToolProvider,
  type TestBinding,
} from "./testing/tool-provider.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const agentId = "ad4f709e-b80e-40f5-80ee-588e1db066e5";
const binding: TestBinding = { turnId: "0d6f4c3e-8b4f-4c39-9d7e-3f1c2a5b6e71", attempt: 1 };
const turn = { turnId: binding.turnId, binding };
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
    tools: [
      "list_projects",
      "delete_project",
      "read_file",
      "download_file",
      "read_private",
      "read_archive",
    ],
    folder,
    ...overrides,
  };
}

async function connected(
  handle?: Parameters<typeof testToolProvider>[0],
  options = leaseOptions(),
) {
  const tools = testToolProvider(handle);
  const host = await createStartupMcp(tools.provider);
  const lease = host.issue(options);
  const client = new Client({ name: "mcp-test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(lease.url), {
      requestInit: { headers: { Authorization: `Bearer ${lease.token}` } },
    }),
  );
  return {
    calls: tools.calls,
    host,
    lease,
    client,
    async close() {
      await client.close();
      await host.close();
    },
  };
}

const answer = (result: ToolCallResult) => async () => result;

function text(result: Awaited<ReturnType<Client["callTool"]>>) {
  // SAFETY: this server returns every result as a single text content block.
  const [content] = result.content as { type: "text"; text: string }[];
  return content!.text;
}

test("initialization uses the provider's identity and offers only the lease's tools", async () => {
  const mcp = await connected(undefined, leaseOptions({ tools: ["list_projects", "unknown"] }));
  try {
    expect(mcp.client.getServerVersion()).toMatchObject({ name: testServer.name });
    expect(mcp.client.getInstructions()).toBe(testServer.instructions);
    const tools = (await mcp.client.listTools()).tools;
    expect(tools.map((tool) => tool.name)).toEqual(["list_projects"]);
    expect(tools[0]?.annotations).toMatchObject({
      title: "List projects",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    mcp.lease.bind(turn);
    expect((await mcp.client.callTool({ name: "delete_project", arguments: {} })).isError).toBe(
      true,
    );
    expect(mcp.calls).toEqual([]);
  } finally {
    await mcp.close();
  }
});

test("calls carry lease identity and the bound turn; calls outside a turn are rejected", async () => {
  const mcp = await connected();
  try {
    const outside = await mcp.client.callTool({ name: "list_projects", arguments: {} });
    expect(outside.isError).toBe(true);
    expect(JSON.parse(text(outside))).toEqual({
      code: "NO_TURN",
      message: "No turn is running for this session.",
      hint: testHint("NO_TURN"),
    });
    expect(mcp.calls).toEqual([]);

    mcp.lease.bind(turn);
    expect(
      (await mcp.client.callTool({ name: "list_projects", arguments: {} })).structuredContent,
    ).toEqual({ items: [], nextCursor: null });
    expect(mcp.calls).toEqual([
      {
        tool: "list_projects",
        input: { limit: 25 },
        organizationId: "org-a",
        agentId,
        sessionId: "session-a",
        binding,
      },
    ]);

    mcp.lease.unbind();
    expect((await mcp.client.callTool({ name: "list_projects", arguments: {} })).isError).toBe(
      true,
    );
    expect(mcp.calls).toHaveLength(1);
  } finally {
    await mcp.close();
  }
});

test("input that fails the tool's schema never reaches the provider", async () => {
  const mcp = await connected();
  try {
    mcp.lease.bind(turn);
    const spoofed = await mcp.client.callTool({
      name: "list_projects",
      arguments: { organizationId: "other-org", turn: binding },
    });
    expect(spoofed.isError).toBe(true);
    expect(mcp.calls).toEqual([]);
  } finally {
    await mcp.close();
  }
});

test("a discovered tool cannot run after its session lease is revoked", async () => {
  const mcp = await connected();
  try {
    const tools = (await mcp.client.listTools()).tools;
    expect(tools.some((tool) => tool.name === "list_projects")).toBe(true);
    mcp.lease.bind(turn);
    mcp.lease.revoke();
    await rejects(mcp.client.callTool({ name: "list_projects", arguments: {} }));
    expect(mcp.calls).toEqual([]);
  } finally {
    await mcp.close();
  }
});

const items = Array.from({ length: 200 }, (_, index) => ({
  id: crypto.randomUUID(),
  name: `Project ${index} ${"x".repeat(40)}`,
}));

test("results above the offload limit are written inside the folder and returned as a reference", async () => {
  const mcp = await connected(answer({ success: true, data: { items, nextCursor: null } }));
  try {
    mcp.lease.bind(turn);
    const result = await mcp.client.callTool({ name: "list_projects", arguments: {} });
    const path = `.substrate/outputs/${binding.turnId}/list_projects-1.json`;
    expect(result.structuredContent).toMatchObject({ truncated: true, path });
    expect(JSON.parse(await readFile(join(folder, path), "utf8"))).toEqual({
      items,
      nextCursor: null,
    });
    expect(await readdir(join(folder, ".substrate", "outputs", binding.turnId))).toEqual([
      "list_projects-1.json",
    ]);
  } finally {
    await mcp.close();
  }
});

test("an inline result stays in the turn however large it is", async () => {
  const data = { items, nextCursor: null };
  const mcp = await connected(answer({ success: true, data }));
  try {
    mcp.lease.bind(turn);
    const result = await mcp.client.callTool({ name: "read_archive", arguments: { id: "a" } });
    expect(result.structuredContent).toEqual(data);
    expect(await readdir(folder)).toEqual([]);
  } finally {
    await mcp.close();
  }
});

test("a turn-only result is returned when small and refused when large, never written", async () => {
  let data = { text: "small" };
  const mcp = await connected(async () => ({ success: true, data }));
  try {
    mcp.lease.bind(turn);
    const call = () => mcp.client.callTool({ name: "read_private", arguments: { id: "a" } });
    expect((await call()).structuredContent).toEqual(data);
    data = { text: "💌".repeat(3000) };
    const large = await call();
    expect(large.isError).toBe(true);
    expect(text(large)).not.toContain("💌");
    expect(await readdir(folder)).toEqual([]);
  } finally {
    await mcp.close();
  }
});

test("a turn-only result is refused when its turn ended during the call", async () => {
  const release = Promise.withResolvers<void>();
  const mcp = await connected(async () => {
    await release.promise;
    return { success: true, data: { text: "private" } };
  });
  try {
    mcp.lease.bind(turn);
    const pending = mcp.client.callTool({ name: "read_private", arguments: { id: "a" } });
    while (!mcp.calls.length) await new Promise((resolve) => setImmediate(resolve));
    mcp.lease.unbind();
    mcp.lease.bind({ turnId: crypto.randomUUID(), binding });
    release.resolve();
    const result = await pending;
    expect(result.isError).toBe(true);
    expect(text(result)).not.toContain("private");
  } finally {
    await mcp.close();
  }
});

test("an image reaches the model as an image block, not as offloaded JSON", async () => {
  const data = Buffer.alloc(32 * 1024, 7).toString("base64");
  const described = { file: "bug", content: { kind: "image", mimeType: "image/webp" } };
  const mcp = await connected(
    answer({ success: true, data: described, image: { data, mimeType: "image/webp" } }),
  );
  try {
    mcp.lease.bind(turn);
    const result = await mcp.client.callTool({ name: "read_file", arguments: { file: "bug" } });
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify(described) },
      { type: "image", data, mimeType: "image/webp" },
    ]);
    expect(await readdir(folder)).toEqual([]);
  } finally {
    await mcp.close();
  }
});

test("a download writes the bytes inside the folder and returns only the path", async () => {
  const bytes = Buffer.from("%PDF-1.7 report");
  const attachmentId = "7c1e3b52-9a4d-4f60-8e2b-1d0c9f8a7b63";
  const metadata = { filename: "../Q3 report?.pdf", size: bytes.length };
  const mcp = await connected(
    answer({
      success: true,
      data: metadata,
      download: { id: attachmentId, filename: metadata.filename, base64: bytes.toString("base64") },
    }),
  );
  try {
    mcp.lease.bind(turn);
    const result = await mcp.client.callTool({
      name: "download_file",
      arguments: { file: "report" },
    });
    const path = `.substrate/files/${binding.turnId}/${attachmentId}-_Q3 report_.pdf`;
    expect(result.structuredContent).toEqual({ ...metadata, path });
    expect(text(result)).not.toContain(bytes.toString("base64"));
    expect(await readFile(join(folder, path))).toEqual(bytes);
  } finally {
    await mcp.close();
  }
});

test("provider errors reach the agent with their fields and the provider's hint", async () => {
  const requestId = "5f0c3a2e-7b1d-4e6f-9a8b-0c1d2e3f4a5b";
  const mcp = await connected(
    answer({
      success: false,
      error: { code: "APPROVAL_PENDING", message: "Waiting for owner approval.", requestId },
    }),
  );
  try {
    mcp.lease.bind(turn);
    const result = await mcp.client.callTool({
      name: "delete_project",
      arguments: { projectId: "p" },
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(text(result))).toEqual({
      code: "APPROVAL_PENDING",
      message: "Waiting for owner approval.",
      requestId,
      hint: testHint("APPROVAL_PENDING"),
    });
    const tools = new Map((await mcp.client.listTools()).tools.map((tool) => [tool.name, tool]));
    expect(tools.get("delete_project")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  } finally {
    await mcp.close();
  }
});

test("a provider that throws makes the operation unavailable", async () => {
  const mcp = await connected(async () => {
    throw new Error("down");
  });
  try {
    mcp.lease.bind(turn);
    const result = await mcp.client.callTool({ name: "list_projects", arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("unavailable");
  } finally {
    await mcp.close();
  }
});

test("loopback MCP rejects revoked, browser and rebound requests", async () => {
  const host = await createStartupMcp(testToolProvider().provider);
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

test("a lease never expires under a bound turn and expires only after it stays unbound", async () => {
  const host = await createStartupMcp(testToolProvider().provider, { leaseTtlMs: 60_000 });
  const lease = host.issue(leaseOptions());
  const client = new Client({ name: "mcp-test", version: "1" });
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
  const host = await createStartupMcp(testToolProvider().provider);
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
