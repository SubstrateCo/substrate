import type { HarnessEventBody } from "@substrate/contracts/harness";

import { AcpSession, antigravitySessionOptions } from "./antigravity.ts";
import type { AdapterContext } from "./types.ts";
import type { PromptResponse, RequestPermissionRequest } from "@agentclientprotocol/sdk";
import { expect, test } from "bun:test";

test("Antigravity session setup keeps workspace tools lazy and credentials session-scoped", () => {
  const context: AdapterContext = {
    directory: "C:/agent",
    executable: "agy",
    emit: () => {},
    lease: {
      url: "http://127.0.0.1:1234/mcp",
      token: "session-secret",
      organizationId: "org-a",
      agentId: "agent-a",
      sessionId: "session-a",
      bind: () => {},
      unbind: () => {},
      revoke: () => {},
    },
  };
  expect(antigravitySessionOptions(context)).toEqual({
    cwd: context.directory,
    mcpServers: [
      {
        type: "http",
        name: "substrate",
        url: context.lease!.url,
        headers: [{ name: "Authorization", value: "Bearer session-secret" }],
        _meta: { antigravity: { forceAllToolsEager: false } },
      },
    ],
  });
  expect(antigravitySessionOptions({ ...context, lease: undefined })).toEqual({
    cwd: context.directory,
    mcpServers: [],
  });
});

test("lazy MCP invocations still require a live interactive turn for native permission prompts", async () => {
  const events: HarnessEventBody[] = [];
  const session = new AcpSession({
    directory: ".",
    executable: "agy",
    emit: (event) => events.push(event),
  });
  const request: RequestPermissionRequest = {
    sessionId: "native-a",
    toolCall: { toolCallId: "call-a", title: "call_mcp_tool", status: "pending" },
    options: [
      { optionId: "allow", name: "Allow", kind: "allow_once" },
      { optionId: "deny", name: "Deny", kind: "reject_once" },
    ],
  };
  expect(await session.permission(request)).toEqual({
    outcome: { outcome: "selected", optionId: "deny" },
  });

  let complete = (_response: PromptResponse) => {};
  const adapter = session.adapter(
    "native-a",
    {
      prompt: () =>
        new Promise<PromptResponse>((resolve) => {
          complete = resolve;
        }),
      cancel: async () => {},
    },
    async () => {},
  );
  const unattended = adapter.turn({ inputIds: ["a"], text: "Background" }, { mode: "unattended" });
  expect(await session.permission(request)).toEqual({
    outcome: { outcome: "selected", optionId: "deny" },
  });
  expect(events).toEqual([]);
  complete({ stopReason: "end_turn" });
  await unattended;

  const interactive = adapter.turn({ inputIds: ["b"], text: "Owner" }, { mode: "interactive" });
  const permission = session.permission(request);
  const opened = events.find((event) => event.type === "request.opened");
  expect(opened?.type).toBe("request.opened");
  if (opened?.type !== "request.opened") throw new Error("Permission request was not surfaced.");
  await adapter.respond(opened.requestId, "allow");
  expect(await permission).toEqual({ outcome: { outcome: "selected", optionId: "allow" } });
  complete({ stopReason: "end_turn" });
  await interactive;
});
