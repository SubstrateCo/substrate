import { agentRunRequestPayload, agentRunRequestResponse } from "./requests.ts";
import type { AgentRunRequestPayload, AgentRunRequestResponse } from "./requests.ts";
import type { AgentTriggerKind } from "./triggers.ts";
import { z } from "zod";

const id = z.uuid();
const organizationId = z.string().min(1).max(200);

export const agentRunStatuses = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "expired",
] as const;
export type AgentRunStatus = (typeof agentRunStatuses)[number];
export const activeAgentRunStatuses: readonly AgentRunStatus[] = ["queued", "running"];

export const agentRunRequestStatuses = ["pending", "resolved", "cancelled", "expired"] as const;
export type AgentRunRequestStatus = (typeof agentRunRequestStatuses)[number];

export const agentRunEventKinds = ["text", "activity", "error"] as const;
export type AgentRunEventKind = (typeof agentRunEventKinds)[number];

// Renderer reads and actions. Only the agent's owner can call them.
export const conversationRunsInput = z.object({ organizationId, conversationId: id });
export const agentRunInput = z.object({ organizationId, runId: id });
export const respondRequestInput = z.strictObject({
  organizationId,
  requestId: id,
  response: agentRunRequestResponse,
});

// Desktop runner calls. The desktop sends its installation ID; the session decides the user.
export const registerDeviceInput = z.strictObject({
  installationId: id,
  name: z.string().trim().min(1).max(200),
  platform: z.string().trim().min(1).max(40),
});
export const claimRunsInput = z.strictObject({ organizationId, installationId: id });
export const heartbeatInput = z.strictObject({
  organizationId,
  installationId: id,
  runIds: z.array(id).max(200),
});
export const runEventsInput = z.strictObject({
  organizationId,
  installationId: id,
  runId: id,
  events: z
    .array(
      z.strictObject({
        kind: z.enum(agentRunEventKinds),
        text: z.string().max(20_000),
      }),
    )
    .min(1)
    .max(100),
});
export const runSessionInput = z.strictObject({
  organizationId,
  installationId: id,
  runId: id,
  harnessSessionId: z.string().min(1).max(200),
});
export const openRequestInput = z.strictObject({
  organizationId,
  installationId: id,
  runId: id,
  nativeRequestId: z.string().min(1).max(500),
  payload: agentRunRequestPayload,
});
export const closeRequestInput = z.strictObject({
  organizationId,
  installationId: id,
  requestId: id,
  status: z.enum(["delivered", "failed", "cancelled"]),
});
export const deliveriesInput = z.strictObject({ organizationId, installationId: id });
export const finishRunInput = z.strictObject({
  organizationId,
  installationId: id,
  runId: id,
  status: z.enum(["completed", "failed", "cancelled"]),
  error: z.string().max(2000).optional(),
});

export interface AgentRunRequestView {
  id: string;
  runId: string;
  status: AgentRunRequestStatus;
  payload: AgentRunRequestPayload;
  response: AgentRunRequestResponse | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AgentRunView {
  id: string;
  agent: { actorId: string; agentId: string; name: string };
  conversationId: string;
  threadId: string;
  status: AgentRunStatus;
  triggerKind: AgentTriggerKind;
  triggerMessageIds: string[];
  /** The latest activity line, for the status card. */
  activity: string | null;
  error: string | null;
  device: { id: string; name: string; online: boolean } | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string;
  requests: AgentRunRequestView[];
}

export interface AgentRunEventView {
  sequence: number;
  kind: AgentRunEventKind;
  text: string;
  createdAt: string;
}

export interface AgentRunDetail extends AgentRunView {
  events: AgentRunEventView[];
}

/** A run that a desktop claimed. The prompt is rendered by the server from the trigger. */
export interface ClaimedAgentRun {
  id: string;
  agentId: string;
  conversationId: string;
  threadId: string;
  prompt: string;
  /** The harness session to resume for this thread on this device, if any. */
  resumeSessionId: string | null;
}

export interface AgentRunDelivery {
  requestId: string;
  runId: string;
  nativeRequestId: string;
  response: AgentRunRequestResponse;
}
