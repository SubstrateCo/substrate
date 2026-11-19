import {
  agentRequestDelivery,
  agentSourcesResult,
  agentWakeView,
  type AgentRequestDelivery,
  type AgentSourcesResult,
  type AgentWakeView,
  type CloseRequestStatus,
  type openRequestInput,
  type publishStatusInput,
  type sourcesInput,
} from "@substrate/contracts/agent-work";
import { harnessKinds, desktopAgentCatalogSchema } from "@substrate/contracts/harness";

import { z } from "zod";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
const id = z.string().min(1);

const result = <T extends z.ZodType>(data: T) =>
  z.union([
    z.object({ success: z.literal(true), data }),
    z.object({
      success: z.literal(false),
      error: z.object({ code: z.string(), message: z.string().optional() }),
    }),
  ]);

class AgentWorkServerError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export interface CatalogAgent {
  id: string;
  name: string;
  harness: (typeof harnessKinds)[number];
  enabled: boolean;
  /** The agent's home device is this desktop. Only home agents run, claim, and fire routines here. */
  home: boolean;
}

/** The home desktop's calls to the server. The session decides the user. */
export interface AgentWorkServer {
  register(input: { name: string; platform: string }): Promise<void>;
  /** Marks this device as seen, so it stays online while realtime replaces polling. */
  heartbeat(): Promise<void>;
  catalog(): Promise<CatalogAgent[]>;
  pullWakes(organizationId: string, limit: number): Promise<AgentWakeView[]>;
  ackWakes(organizationId: string, ids: string[]): Promise<void>;
  /** invocationIds are calls to recheck; the server leaves out the messages of revoked calls. */
  sources(
    organizationId: string,
    messageIds: string[],
    invocationIds?: string[],
  ): Promise<AgentSourcesResult>;
  publishStatus(input: Omit<z.input<typeof publishStatusInput>, "installationId">): Promise<void>;
  openRequest(
    input: Omit<z.input<typeof openRequestInput>, "installationId">,
  ): Promise<{ id: string; status: string }>;
  closeRequest(
    organizationId: string,
    requestId: string,
    status: CloseRequestStatus,
  ): Promise<void>;
  requestAnswers(organizationId: string): Promise<AgentRequestDelivery[]>;
  /** The owner's direct conversation with the agent, created when missing. */
  directConversation(organizationId: string, agentId: string): Promise<string>;
  /** IDs of the owner's requests that are still open, from the server's needs-you list. */
  openRequestIds(organizationId: string): Promise<string[]>;
}

/** Codes after which the caller verifies the session again. */
const deniedCodes = new Set(["UNAUTHENTICATED", "FORBIDDEN", "WORKSPACE_CHANGED"]);

export function createAgentWorkServer(options: {
  backend: string;
  installationId: string;
  fetchAPI: Fetch;
  /** The server denied a call: the session or the membership may have changed. */
  onDenied?: () => void;
  catalog: () => Promise<z.output<typeof desktopAgentCatalogSchema>>;
}): AgentWorkServer {
  async function call<T extends z.ZodType>(
    path: string,
    body: z.core.util.JSONType | undefined,
    schema: T,
    method = "POST",
  ): Promise<z.output<T>> {
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
  }
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
      return catalog.agents.map((agent) => ({ ...agent, home: home.has(agent.id) }));
    },
    async pullWakes(organizationId, limit) {
      return call(
        "/agent-work/device/wakes/pull",
        { ...device(organizationId), limit, capabilities: ["caller_wakes"] },
        z.array(agentWakeView),
      );
    },
    async ackWakes(organizationId, ids) {
      if (ids.length)
        await call("/agent-work/device/wakes/ack", { ...device(organizationId), ids }, ignored);
    },
    async sources(organizationId, messageIds, invocationIds = []) {
      if (!messageIds.length && !invocationIds.length) return { messages: [], inaccessible: [] };
      const input: z.input<typeof sourcesInput> = { ...device(organizationId), messageIds };
      // Older servers reject unknown fields, so a batch without calls leaves the field out.
      if (invocationIds.length) input.invocationIds = invocationIds;
      return call("/agent-work/device/sources", input, agentSourcesResult);
    },
    async publishStatus(input) {
      await call(
        "/agent-work/device/status",
        { ...input, installationId: options.installationId },
        ignored,
      );
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
    async directConversation(organizationId, agentId) {
      const conversation = await call(
        "/messaging/conversations",
        { organizationId, kind: "dm", agentIds: [agentId] },
        z.object({ id }),
      );
      return conversation.id;
    },
    async openRequestIds(organizationId) {
      const query = new URLSearchParams({ organizationId });
      const needsYou = await call(
        `/agent-work/needs-you?${query}`,
        undefined,
        z.object({ requests: z.array(z.object({ id })) }),
        "GET",
      );
      return needsYou.requests.map((request) => request.id);
    },
  };
}
