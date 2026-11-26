import type { HarnessMcpServer } from "@substrate/contracts/harness-runtime";

import {
  credentialsMessage,
  draftFromServer,
  mcpServerId,
  newArgRow,
  newEnvironmentRow,
  serverFromDraft,
  type McpServerDraft,
} from "./mcp-server-draft";
import { describe, expect, test } from "bun:test";

const args = (...values: string[]) => values.map((value) => newArgRow(value));
const environment = (...rows: [string, string][]) =>
  rows.map(([key, value]) => newEnvironmentRow(key, value));

const stdio = (overrides: Partial<McpServerDraft> = {}): McpServerDraft => ({
  ...draftFromServer(),
  name: "Linear",
  command: "npx",
  args: args("-y", "linear-mcp", ""),
  ...overrides,
});

describe("MCP server drafts", () => {
  test("a new stdio server takes its ID from its name and drops empty rows", () => {
    expect(serverFromDraft(stdio({ environment: environment(["", ""]) }), { servers: [] })).toEqual(
      {
        server: {
          id: "linear",
          name: "Linear",
          transport: "stdio",
          command: "npx",
          args: ["-y", "linear-mcp"],
        },
      },
    );
    expect(mcpServerId("  My Docs Server ")).toBe("my-docs-server");
  });

  test("a saved stdio server round-trips through its draft without row IDs", () => {
    const server: HarnessMcpServer = {
      id: "linear",
      name: "Linear",
      transport: "stdio",
      command: "npx",
      args: ["-y", "linear-mcp"],
      environment: { REGION: "us" },
    };
    expect(serverFromDraft(draftFromServer(server), { id: server.id, servers: [server] })).toEqual({
      server,
    });
  });

  test("editing keeps the server's ID when the name changes", () => {
    const result = serverFromDraft(stdio({ name: "Linear (work)" }), {
      id: "linear",
      servers: [],
    });
    expect(result.server?.id).toBe("linear");
    expect(result.server?.name).toBe("Linear (work)");
  });

  test("rejects credentials in arguments and environment variables", () => {
    const result = serverFromDraft(
      stdio({
        args: args("--token=abc"),
        environment: environment(["REGION", "us"], ["GITHUB_TOKEN", "x"]),
      }),
      { servers: [] },
    );
    expect(result.errors?.args).toEqual({ 0: credentialsMessage });
    expect(result.errors?.environment).toEqual({ 1: credentialsMessage });
  });

  test("rejects an http URL with credentials or a query", () => {
    const result = serverFromDraft(
      { ...draftFromServer(), name: "Docs", transport: "http", url: "https://u:p@mcp.test/?k=1" },
      { servers: [] },
    );
    expect(result.errors?.url).toContain("without a user name, password, query");
  });

  test("a new server cannot reuse another server's name or the built-in name", () => {
    const existing: HarnessMcpServer[] = [
      { id: "linear", name: "Linear", transport: "http", url: "https://mcp.linear.app/mcp" },
    ];
    expect(serverFromDraft(stdio(), { servers: existing }).errors?.name).toBe(
      "Another server already has this name.",
    );
    expect(serverFromDraft(stdio({ name: "Substrate" }), { servers: [] }).errors?.name).toContain(
      "built-in server",
    );
  });

  test("names each missing field", () => {
    const result = serverFromDraft(
      stdio({ name: "", command: "", environment: environment(["", "1"]) }),
      { servers: [] },
    );
    expect(result.errors?.name).toBeDefined();
    expect(result.errors?.command).toBe("Enter the command that starts the server.");
    expect(result.errors?.environment).toEqual({ 0: "Enter a variable name." });
  });
});
