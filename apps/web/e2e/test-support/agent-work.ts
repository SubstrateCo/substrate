import type { TurnContext } from "@startup-os/contracts/harness/mcp";
import { mcpTools, type McpOutput, type ServerToolName } from "@startup-os/contracts/harness/tools";

import type { Actor } from "./fixtures";
import { expect } from "@playwright/test";
import { z } from "zod";

/** Creates an agent homed on a registered test desktop. Only the home desktop can write as it. */
export async function createAgent(owner: Actor) {
  const installationId = crypto.randomUUID();
  const registered = await owner.request.post("/api/v1/agent-work/device/register", {
    data: { installationId, name: "Laptop", platform: "win32" },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
  const name = `Research ${crypto.randomUUID()}`;
  const saved = await owner.request.post("/api/v1/agents/actors/save", {
    headers: { "x-startup-os-installation": installationId },
    data: { name, instructions: "Help with work", harness: "opencode", enabled: true },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  const { data } = savedAgent.parse(await saved.json());
  return { id: data.id, name, installationId };
}

const savedAgent = z.object({ data: z.object({ id: z.uuid() }) });

/** Adds the owner's agent to a conversation, as the owner does from the conversation menu. */
export async function addAgent(owner: Actor, conversationId: string, agentId: string) {
  const added = await owner.request.post("/api/v1/messaging/agents/add", {
    data: { organizationId: owner.organizationId, conversationId, agentId },
  });
  expect(added.ok(), await added.text()).toBe(true);
}

/** An interactive turn in a thread, as the desktop host would attach it to every MCP call. */
export function threadTurn(
  conversationId: string,
  rootMessageId: string,
  installationId: string,
): TurnContext {
  return {
    turnId: crypto.randomUUID(),
    attempt: 1,
    sessionKey: `thread:${rootMessageId}`,
    origin: { conversationId, threadId: rootMessageId },
    kind: "interactive",
    installationId,
  };
}

/** Calls a server tool as the agent, the way the home desktop's MCP lease does. */
export async function callTool<K extends ServerToolName>(
  owner: Actor,
  agentId: string,
  turn: TurnContext,
  tool: K,
  /** The tool input without requestId, which each call generates. */
  input: Omit<z.input<(typeof mcpTools)[K]["input"]>, "requestId">,
): Promise<McpOutput<K>> {
  const response = await owner.request.post("/api/v1/mcp/call", {
    data: {
      organizationId: owner.organizationId,
      agentId,
      tool,
      turn,
      input: { requestId: crypto.randomUUID(), ...input },
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  // SAFETY: the schema parsed is the named tool's own output schema.
  return mcpTools[tool].output.parse((await response.json()).data) as McpOutput<K>;
}
