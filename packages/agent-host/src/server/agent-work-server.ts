import {
  agentRequestDelivery,
  agentSourcesResult,
  proposalOutcome,
  type sourcesInput,
} from "@substrate/contracts/agent-work";
import type { AgentCatalog } from "@substrate/contracts/agents";

import type { AgentWorkServer } from "../ports.ts";
import { z } from "zod";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
const id = z.string().min(1);
const threadMessageSchema = z.object({
  id,
  body: z.string(),
  createdAt: z.string(),
  authorType: z.enum(["human", "agent"]),
  originTurnId: id.nullable(),
});
export type ThreadMessage = z.output<typeof threadMessageSchema>;

const result = <T extends z.ZodType>(data: T) =>
  z.union([
    z.object({ success: z.literal(true), data }),
    z.object({
      success: z.literal(false),
      error: z.object({ code: z.string(), message: z.string().optional() }),
    }),
  ]);

export class AgentWorkServerError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

const agentRequestState = z.object({
  status: z.string(),
  outcome: proposalOutcome.nullable(),
});
export type AgentRequestState = z.output<typeof agentRequestState>;

/** Codes after which the caller verifies the session again. */
const deniedCodes = new Set(["UNAUTHENTICATED", "FORBIDDEN", "WORKSPACE_CHANGED"]);

export type ServerCall = <T extends z.ZodType>(
  path: string,
  body: z.core.util.JSONType | undefined,
  schema: T,
  method?: string,
) => Promise<z.output<T>>;

/** One parsed API call. A failure keeps the server's error code. */
export function createServerCall(options: {
  backend: string;
  fetchAPI: Fetch;
  /** The server denied a call: the session or the membership may have changed. */
  onDenied?: () => void;
}): ServerCall {
  return async (path, body, schema, method = "POST") => {
    const response = await options.fetchAPI(new URL(`/api/v1${path}`, options.backend).href, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body),
      redirect: "error",
    });
    const parsed = result(z.unknown()).safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new AgentWorkServerError("INVALID_RESPONSE", path);
    if (!parsed.data.success) {
      if (deniedCodes.has(parsed.data.error.code)) options.onDenied?.();
      throw new AgentWorkServerError(parsed.data.error.code, parsed.data.error.message);
    }
    const data = schema.safeParse(parsed.data.data);
    if (!data.success) throw new AgentWorkServerError("INVALID_RESPONSE", path);
    return data.data;
  };
}

export function createAgentWorkServer(options: {
  call: ServerCall;
  installationId: string;
  catalog: () => Promise<AgentCatalog>;
}): AgentWorkServer {
  const { call } = options;
  const device = (organizationId: string) => ({
    organizationId,
    installationId: options.installationId,
  });
  const ignored = z.unknown();

  return {
    async register(input) {
      await call(
        "/agent-work/device/register",
        {
          installationId: options.installationId,
          name: input.name.slice(0, 200) || "Desktop",
          platform: input.platform.slice(0, 40) || "desktop",
        },
        ignored,
      );
    },
    async heartbeat() {
      await call(
        "/agent-work/device/heartbeat",
        { installationId: options.installationId },
        ignored,
      );
    },
    async catalog() {
      const catalog = await options.catalog();
      // The server marks the home device that matches this installation as current.
      const home = new Set(
        catalog.runSettings
          .filter((settings) => settings.homeDevice?.current === true)
          .map((settings) => settings.agentId),
      );
      return catalog.agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        harness: agent.harness,
        enabled: agent.enabled,
        home: home.has(agent.id),
      }));
    },
    async sources(organizationId, messageIds) {
      if (!messageIds.length) return { messages: [], inaccessible: [] };
      const input: z.input<typeof sourcesInput> = { ...device(organizationId), messageIds };
      return call("/agent-work/device/sources", input, agentSourcesResult);
    },
    async threadMessages(organizationId, conversationId, threadId, beforeMessageId) {
      const query = new URLSearchParams({ organizationId, conversationId, threadId });
      if (beforeMessageId) query.set("beforeMessageId", beforeMessageId);
      return call(`/messaging/messages?${query}`, undefined, z.array(threadMessageSchema), "GET");
    },
    async openRequest(input) {
      return call(
        "/agent-work/device/requests",
        { ...input, installationId: options.installationId },
        z.object({ id, status: z.string() }),
      );
    },
    async closeRequest(organizationId, requestId, status) {
      await call(
        "/agent-work/device/requests/close",
        { ...device(organizationId), requestId, status },
        ignored,
      );
    },
    async requestAnswers(organizationId) {
      return call(
        "/agent-work/device/requests/answers",
        device(organizationId),
        z.array(agentRequestDelivery),
      );
    },
    async requestStatus(organizationId, requestId) {
      const query = new URLSearchParams(device(organizationId));
      return call(
        `/agent-work/device/requests/${encodeURIComponent(requestId)}?${query}`,
        undefined,
        agentRequestState,
        "GET",
      );
    },
  };
}
