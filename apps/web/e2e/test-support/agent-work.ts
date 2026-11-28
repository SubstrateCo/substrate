import { workspaceApiResult, type TurnContext } from "@substrate/contracts/agent-tools/mcp";
import {
  mcpTools,
  type McpOutput,
  type ServerToolName,
} from "@substrate/contracts/agent-tools/tools";
import { approvalPendingCode } from "@substrate/contracts/agent-work";
import type { HostFinishInput } from "@substrate/contracts/agent-work/control";

import { post, type Actor } from "./fixtures";
import { expect } from "@playwright/test";
import { z } from "zod";

export type HomedAgent = { id: string; name: string; installationId: string };

export async function createAgent(owner: Actor, name = `Research ${crypto.randomUUID()}`) {
  const installationId = crypto.randomUUID();
  const registered = await owner.request.post("/api/v1/agent-work/device/register", {
    data: { installationId, name: "Laptop", platform: "win32" },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
  const saved = await owner.request.post("/api/v1/agents/actors/save", {
    headers: { "x-substrate-installation": installationId },
    data: { name, instructions: "Help with work", harness: "opencode", enabled: true },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  const { data } = savedAgent.parse(await saved.json());
  return { id: data.id, name, installationId } satisfies HomedAgent;
}

const savedAgent = z.object({ data: z.object({ id: z.uuid() }) });

export async function addAgent(owner: Actor, conversationId: string, agentId: string) {
  const added = await owner.request.post("/api/v1/messaging/agents/add", {
    data: { organizationId: owner.organizationId, conversationId, agentId },
  });
  expect(added.ok(), await added.text()).toBe(true);
}

const conversationMembers = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      members: z.array(z.object({ actorId: z.string(), agentId: z.string().nullish() })),
    }),
  ),
});

export async function agentMention(owner: Actor, conversationId: string, agentId: string) {
  const response = await owner.request.get("/api/v1/messaging/conversations", {
    params: { organizationId: owner.organizationId },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const { data } = conversationMembers.parse(await response.json());
  const member = data
    .find((entry) => entry.id === conversationId)
    ?.members.find((entry) => entry.agentId === agentId);
  if (!member) throw new Error("Add the agent to the conversation before mentioning it.");
  return `@[agent:${member.actorId}]`;
}

type HostBody = Partial<
  Pick<
    HostFinishInput,
    "attempt" | "status" | "outcome" | "interruption" | "attentionReason" | "error"
  >
> & {
  sourceMessages?: {
    messageId: string;
    conversationId: string;
    threadId: string | null;
    createdAt: string;
  }[];
};

async function hostCall(owner: Actor, agent: HomedAgent, path: string, data: HostBody = {}) {
  const response = await owner.request.post(`/api/v1/agent-work/${path}`, {
    headers: { "x-substrate-installation": agent.installationId },
    data: { organizationId: owner.organizationId, installationId: agent.installationId, ...data },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

export type AgentTurn = { agent: HomedAgent; context: TurnContext };

const claimed = z.object({
  data: z.object({
    turns: z.array(
      z.object({
        turn: z.object({ id: z.uuid(), userAgentId: z.string(), attempt: z.number() }),
      }),
    ),
  }),
});

type SourceMessage = { id: string; conversationId: string; threadId: string | null };

export async function claimTurn(
  owner: Actor,
  agent: HomedAgent,
  source: SourceMessage,
): Promise<AgentTurn> {
  let turn: { id: string; attempt: number } | undefined;
  await expect
    .poll(
      async () => {
        const { data } = claimed.parse(await hostCall(owner, agent, "host/claim"));
        turn = data.turns.find((entry) => entry.turn.userAgentId === agent.id)?.turn;
        return !!turn;
      },
      { intervals: [250] },
    )
    .toBe(true);
  const { id: turnId, attempt } = turn!;
  await hostCall(owner, agent, `host/turns/${turnId}/start`, { attempt });
  await hostCall(owner, agent, `host/turns/${turnId}/progress`, {
    attempt,
    sourceMessages: [
      {
        messageId: source.id,
        conversationId: source.conversationId,
        threadId: source.threadId,
        createdAt: new Date().toISOString(),
      },
    ],
  });
  return { agent, context: { turnId, attempt } };
}

export async function startTurn(
  owner: Actor,
  agent: HomedAgent,
  conversationId: string,
  root?: { id: string },
  body = "Please take this on.",
): Promise<AgentTurn> {
  const mention = await agentMention(owner, conversationId, agent.id);
  const message = await post<{ id: string }>(owner, "messaging/messages", {
    conversationId,
    threadId: root?.id,
    body: `${mention} ${body}`,
  });
  return claimTurn(owner, agent, {
    id: message.id,
    conversationId,
    threadId: root?.id ?? null,
  });
}

export async function finishTurn(
  owner: Actor,
  turn: AgentTurn,
  result: Omit<HostBody, "attempt" | "sourceMessages"> & { status: HostFinishInput["status"] },
) {
  return hostCall(owner, turn.agent, `host/turns/${turn.context.turnId}/finish`, {
    attempt: turn.context.attempt,
    ...result,
  });
}

export async function callTool<K extends ServerToolName>(
  owner: Actor,
  turn: AgentTurn,
  tool: K,
  input: Omit<z.input<(typeof mcpTools)[K]["input"]>, "requestId">,
): Promise<McpOutput<K>> {
  const response = await mcpCall(owner, turn, tool, withRequestId(tool, input));
  expect(response.ok(), await response.text()).toBe(true);
  // SAFETY: the schema parsed is the named tool's own output schema.
  return mcpTools[tool].output.parse((await response.json()).data) as McpOutput<K>;
}

export async function readTool<K extends ServerToolName>(
  owner: Actor,
  turn: AgentTurn,
  tool: K,
  input: z.input<(typeof mcpTools)[K]["input"]>,
): Promise<McpOutput<K>> {
  const response = await mcpCall(owner, turn, tool, input);
  expect(response.ok(), await response.text()).toBe(true);
  // SAFETY: the schema parsed is the named tool's own output schema.
  return mcpTools[tool].output.parse((await response.json()).data) as McpOutput<K>;
}

export async function proposeTool<K extends ServerToolName>(
  owner: Actor,
  turn: AgentTurn,
  tool: K,
  input: Omit<z.input<(typeof mcpTools)[K]["input"]>, "requestId">,
): Promise<string> {
  const response = await mcpCall(owner, turn, tool, withRequestId(tool, input));
  const result = workspaceApiResult.parse(await response.json());
  expect(result).toMatchObject({ success: false, error: { code: approvalPendingCode } });
  const requestId = result.success ? undefined : result.error.requestId;
  if (!requestId) throw new Error("APPROVAL_PENDING returned no requestId.");
  return requestId;
}

type ToolInput<K extends ServerToolName> = z.input<(typeof mcpTools)[K]["input"]>;

function withRequestId<K extends ServerToolName>(tool: K, input: Omit<ToolInput<K>, "requestId">) {
  const withId = { requestId: crypto.randomUUID(), ...input };
  const takesRequestId = mcpTools[tool].input.safeParse(withId).success;
  // SAFETY: requestId is added only where the tool's input has it; the rest is the caller's typed input.
  return (takesRequestId ? withId : input) as ToolInput<K>;
}

function mcpCall<K extends ServerToolName>(
  owner: Actor,
  turn: AgentTurn,
  tool: K,
  input: ToolInput<K>,
) {
  return owner.request.post("/api/v1/mcp/call", {
    headers: { "x-substrate-installation": turn.agent.installationId },
    data: {
      organizationId: owner.organizationId,
      agentId: turn.agent.id,
      tool,
      turn: turn.context,
      input,
    },
  });
}
