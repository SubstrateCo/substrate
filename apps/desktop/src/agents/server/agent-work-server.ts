import {
  agentRequestResponse,
  agentWakeRequestDetail,
  agentWakeSourceRef,
  agentWakeSources,
  type AgentRequestDelivery,
  type AgentSourcesResult,
  type AgentWakeView,
  type openRequestInput,
  type publishStatusInput,
} from "@startup-os/contracts/agent-work";
import { harnessKinds } from "@startup-os/contracts/harness";

/* oxlint-disable deslop/no-unknown-parameters -- Server responses are parsed at this boundary. */
import { z } from "zod";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const result = <T extends z.ZodType>(data: T) =>
  z.union([
    z.object({ success: z.literal(true), data }),
    z.object({
      success: z.literal(false),
      error: z.object({ code: z.string(), message: z.string().optional() }),
    }),
  ]);

const id = z.string().min(1);
const wakeSchema = z.object({
  id,
  userAgentId: id,
  source: z.enum(agentWakeSources),
  sourceRef: agentWakeSourceRef,
  sessionKey: z.string(),
  dedupeKey: z.string(),
  createdAt: z.string(),
  request: agentWakeRequestDetail.nullable(),
});
const sourcesSchema = z.object({
  messages: z.array(
    z.object({
      id,
      conversationId: id,
      threadId: id.nullable(),
      conversationName: z.string(),
      conversationKind: z.enum(["dm", "group", "channel"]),
      author: z.object({
        actorId: id,
        name: z.string(),
        kind: z.enum(["owner", "member", "agent"]),
      }),
      body: z.string(),
      createdAt: z.string(),
    }),
  ),
  inaccessible: z.array(id),
});
const deliverySchema = z.object({
  requestId: id,
  userAgentId: id,
  turnId: id,
  nativeRequestId: z.string(),
  response: agentRequestResponse,
});
const catalogSchema = z.object({
  agents: z.array(
    z.object({ id, name: z.string(), harness: z.enum(harnessKinds), enabled: z.boolean() }),
  ),
  runSettings: z.array(
    z.object({ agentId: id, homeDevice: z.object({ current: z.boolean() }).nullable() }),
  ),
});
const sessionSchema = z.object({
  user: z.object({ id }),
  session: z.object({ activeOrganizationId: z.string().nullish() }),
});

export class AgentWorkServerError extends Error {
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
  session(): Promise<{ userId: string; organizationId: string | null } | null>;
  register(input: { name: string; platform: string }): Promise<void>;
  catalog(): Promise<CatalogAgent[]>;
  pullWakes(organizationId: string, limit: number): Promise<AgentWakeView[]>;
  ackWakes(organizationId: string, ids: string[]): Promise<void>;
  sources(organizationId: string, messageIds: string[]): Promise<AgentSourcesResult>;
  publishStatus(input: Omit<z.input<typeof publishStatusInput>, "installationId">): Promise<void>;
  openRequest(
    input: Omit<z.input<typeof openRequestInput>, "installationId">,
  ): Promise<{ id: string; status: string }>;
  closeRequest(
    organizationId: string,
    requestId: string,
    status: "delivered" | "cancelled" | "expired" | "orphaned",
  ): Promise<void>;
  requestAnswers(organizationId: string): Promise<AgentRequestDelivery[]>;
  /** The owner's direct conversation with the agent, created when missing. */
  directConversation(organizationId: string, agentId: string): Promise<string>;
  /** IDs of the owner's requests that are still open, from the server's needs-you list. */
  openRequestIds(organizationId: string): Promise<string[]>;
}

export function createAgentWorkServer(options: {
  backend: string;
  installationId: string;
  fetchAPI: Fetch;
}): AgentWorkServer {
  async function call<T extends z.ZodType>(
    path: string,
    body: unknown,
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
    if (!parsed.data.success)
      throw new AgentWorkServerError(parsed.data.error.code, parsed.data.error.message);
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
    async session() {
      const response = await options.fetchAPI(new URL("/api/v1/session", options.backend).href, {
        method: "GET",
        redirect: "error",
      });
      if (!response.ok) return null;
      const parsed = result(sessionSchema).safeParse(await response.json().catch(() => null));
      if (!parsed.success || !parsed.data.success) return null;
      return {
        userId: parsed.data.data.user.id,
        organizationId: parsed.data.data.session.activeOrganizationId ?? null,
      };
    },
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
    async catalog() {
      const catalog = await call("/agents/list", {}, catalogSchema);
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
        { ...device(organizationId), limit },
        z.array(wakeSchema),
      );
    },
    async ackWakes(organizationId, ids) {
      if (ids.length)
        await call("/agent-work/device/wakes/ack", { ...device(organizationId), ids }, ignored);
    },
    async sources(organizationId, messageIds) {
      if (!messageIds.length) return { messages: [], inaccessible: [] };
      return call(
        "/agent-work/device/sources",
        { ...device(organizationId), messageIds },
        sourcesSchema,
      );
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
        z.array(deliverySchema),
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
