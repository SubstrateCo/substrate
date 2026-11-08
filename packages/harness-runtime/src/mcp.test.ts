import type { WorkspaceApiRequest } from "@startup-os/contracts/harness/mcp";

import { createStartupMcp } from "./mcp.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "bun:test";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations. */

test("the internal API proxy requires a live lease and does not add MCP tools", async () => {
  const calls: unknown[] = [];
  const host = await createStartupMcp(async (call) => {
    calls.push(call);
    return { success: true, data: ["project"] };
  });
  const lease = host.issue("org-a", "agent-a");
  const client = new Client({ name: "proxy-test", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(lease.url), {
        requestInit: { headers: { Authorization: `Bearer ${lease.token}` } },
      }),
    );
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["hello_world"]);
    expect((await client.callTool({ name: "hello_world", arguments: {} })).content).toEqual([
      { type: "text", text: "Hello, world!" },
    ]);
    expect(calls).toEqual([]);
    const request: WorkspaceApiRequest = {
      method: "GET",
      path: "/api/v1/tasks/projects",
      input: {},
    };
    expect(await host.requestApi(lease.token, request)).toEqual({
      success: true,
      data: ["project"],
    });
    lease.revoke();
    await expect(host.requestApi(lease.token, request)).rejects.toThrow("Credential revoked");
    expect(calls).toEqual([request]);
  } finally {
    await client.close();
    await host.close();
  }
});

test("loopback MCP exposes only hello_world and rejects revoked or browser requests", async () => {
  const host = await createStartupMcp();
  const lease = host.issue("org-a", "agent-a");
  const client = new Client({ name: "runtime-test", version: "1.0.0" });
  try {
    const headers = { Authorization: `Bearer ${lease.token}` };
    await client.connect(
      new StreamableHTTPClientTransport(new URL(lease.url), { requestInit: { headers } }),
    );
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["hello_world"]);
    expect((await client.callTool({ name: "hello_world", arguments: {} })).content).toEqual([
      { type: "text", text: "Hello, world!" },
    ]);
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
    await expect(client.callTool({ name: "hello_world", arguments: {} })).rejects.toThrow();
  } finally {
    await client.close();
    await host.close();
  }
});

test("revoking one scoped MCP credential does not revoke another organization", async () => {
  const host = await createStartupMcp();
  try {
    const first = host.issue("org-a", "agent-a");
    const second = host.issue("org-b", "agent-b");
    first.revoke();
    const response = await fetch(second.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${second.token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      }),
    });
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("org-b");
  } finally {
    await host.close();
  }
});

test("MCP rejects malformed authorization without accepting bare tokens or crashing", async () => {
  const host = await createStartupMcp();
  const lease = host.issue("org", "agent");
  try {
    for (const authorization of [lease.token, `Bearer ${"é".repeat(64)}`, `Basic ${lease.token}`]) {
      const response = await fetch(lease.url, {
        method: "POST",
        headers: { Authorization: authorization },
        body: "{}",
      });
      expect(response.status).toBe(401);
    }
    const response = await fetch(lease.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${lease.token}` },
      body: "{}",
    });
    expect(response.status).not.toBe(401);
  } finally {
    await host.close();
  }
});
