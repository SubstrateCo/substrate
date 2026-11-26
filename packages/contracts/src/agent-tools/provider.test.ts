import type { LocalToolRequest, WorkspaceApiRequest, WorkspaceApiResult } from "./mcp.ts";
import { agentToolProvider } from "./provider.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

const turn = { turnId: crypto.randomUUID(), attempt: 1 };
const scope = {
  organizationId: "org-a",
  agentId: crypto.randomUUID(),
  sessionId: "session-a",
  binding: turn,
};
const fileLocator = {
  type: "message_attachment",
  messageId: crypto.randomUUID(),
  attachmentId: crypto.randomUUID(),
} as const;
const fileRef = { file: fileLocator, filename: "bug.png", contentType: "image/png", size: 9 };

function provider(result: WorkspaceApiResult = { success: true, data: {} }) {
  const workspace: WorkspaceApiRequest[] = [];
  const local: LocalToolRequest[] = [];
  return {
    workspace,
    local,
    tools: agentToolProvider({
      workspace: async (call) => {
        workspace.push(call);
        return result;
      },
      local: async (call) => {
        local.push(call);
        return result;
      },
    }),
  };
}

test("the server explains discovery briefly, and tools keep their catalog hints", () => {
  const { tools } = provider();
  expect(tools.server.name).toBe("substrate");
  expect(tools.server.instructions).toContain("discover");
  expect(tools.server.instructions).toContain("skills");
  expect(tools.server.instructions.length).toBeLessThan(1024);
  expect(tools.describe("list_crm_records")).toMatchObject({ readOnly: true, idempotent: true });
  expect(tools.describe("create_crm_deal")).toMatchObject({ readOnly: false, idempotent: true });
  expect(tools.describe("update_task")).toMatchObject({ readOnly: false, destructive: true });
  expect(tools.describe("not_a_tool")).toBeUndefined();
  expect(tools.describe("toString")).toBeUndefined();
});

test("a turn binds only its own server turn context", () => {
  const { tools } = provider();
  expect(tools.bind(turn, turn.turnId)).toEqual(turn);
  expect(() => tools.bind(turn, crypto.randomUUID())).toThrow();
  expect(() => tools.bind({ ...turn, attempt: 0 }, turn.turnId)).toThrow();
  expect(() => tools.bind({ ...turn, sessionId: "s" }, turn.turnId)).toThrow();
});

test("server tools reach the workspace API and local tools the desktop, with the turn", async () => {
  const { tools, workspace, local } = provider({
    success: true,
    data: { items: [], nextCursor: null },
  });
  const input = { archived: "active", limit: 25 };
  expect(await tools.call({ ...scope, tool: "list_projects", input })).toEqual({
    success: true,
    data: { items: [], nextCursor: null },
  });
  expect(workspace).toEqual([
    { tool: "list_projects", organizationId: "org-a", agentId: scope.agentId, turn, input },
  ]);
  expect(local).toEqual([]);
  const desktop = provider({ success: true, data: { saved: true } });
  const handoff = { objectives: "Ship the report.", openWork: "", references: [] };
  await desktop.tools.call({ ...scope, tool: "save_handoff", input: handoff });
  expect(desktop.workspace).toEqual([]);
  expect(desktop.local).toEqual([
    {
      tool: "save_handoff",
      sessionId: "session-a",
      organizationId: "org-a",
      agentId: scope.agentId,
      turn,
      input: handoff,
    },
  ]);
});

test("unknown tools and results that fail the output schema throw", async () => {
  const { tools } = provider({ success: true, data: { unexpected: true } });
  await rejects(tools.call({ ...scope, tool: "nope", input: {} }));
  await rejects(tools.call({ ...scope, tool: "list_projects", input: {} }));
});

test("downloads and images leave the JSON path", async () => {
  const bytes = Buffer.from("%PDF").toString("base64");
  expect(
    await provider({ success: true, data: { ...fileRef, data: bytes } }).tools.call({
      ...scope,
      tool: "download_file",
      input: { file: fileLocator },
    }),
  ).toEqual({
    success: true,
    data: fileRef,
    download: { id: fileLocator.attachmentId, filename: fileRef.filename, base64: bytes },
  });
  const image = { kind: "image", mimeType: "image/webp", data: "AAAA" } as const;
  expect(
    await provider({ success: true, data: { ...fileRef, content: image } }).tools.call({
      ...scope,
      tool: "read_file",
      input: { file: fileLocator, offset: 0 },
    }),
  ).toEqual({
    success: true,
    data: { ...fileRef, content: { kind: "image", mimeType: "image/webp" } },
    image: { data: "AAAA", mimeType: "image/webp" },
  });
});

test("Inbox results stay in the owner's turn", () => {
  const { tools } = provider();
  expect(tools.outputPolicy("search_inbox")).toBe("turn-only");
  expect(tools.outputPolicy("read_inbox_message")).toBe("turn-only");
  expect(tools.outputPolicy("list_projects")).toBe("offload");
});

test("error hints tell the agent when to stop instead of retrying", () => {
  const { tools } = provider();
  expect(tools.errorHint("FORBIDDEN")).toContain("start a new run");
  expect(tools.errorHint("APP_DISABLED")).toContain("Do not retry");
  expect(tools.errorHint("APPROVAL_PENDING")).toContain("Do not retry or work around it");
  expect(tools.errorHint("NO_TURN")).toContain("only while a turn is running");
  expect(tools.errorHint("SOMETHING_NEW")).toContain("Retry once");
});
