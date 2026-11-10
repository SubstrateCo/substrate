import { agentRequestPayload } from "./requests.ts";
import { agentActivityMaxLength, agentStatusStates } from "./status.ts";
import { sessionKey } from "./wakes.ts";
import { z } from "zod";

// Home desktop calls under /agent-work/device/*. The session decides the user; the server checks
// the registered device and derives every agent from it. Bodies never name the owner.

const id = z.uuid();
const organizationId = z.string().min(1).max(200);
const device = { organizationId, installationId: id };

export const registerDeviceInput = z.strictObject({
  installationId: id,
  name: z.string().trim().min(1).max(200),
  platform: z.string().trim().min(1).max(40),
});

/** Keeps the device online while realtime makes polling unnecessary. */
export const deviceHeartbeatInput = z.strictObject({ installationId: id });

export const pullWakesInput = z.strictObject({
  ...device,
  limit: z.number().int().min(1).max(100).default(50),
});

export const ackWakesInput = z.strictObject({ ...device, ids: z.array(id).min(1).max(100) });

export const sourcesInput = z.strictObject({
  ...device,
  messageIds: z.array(id).min(1).max(100),
});

export const publishStatusInput = z.strictObject({
  ...device,
  userAgentId: id,
  state: z.enum(agentStatusStates),
  queuedCount: z.number().int().min(0).max(10_000),
  liveConversationId: id.optional(),
  liveThreadId: id.optional(),
  activity: z.string().max(agentActivityMaxLength).optional(),
  /** The server keeps the row with the highest version. */
  version: z.number().int().min(0),
});

const [approvalPayload, questionsPayload] = agentRequestPayload.options;

/** Native blocking prompts only. Async questions and proposals start from MCP tools. */
export const openRequestInput = z.strictObject({
  ...device,
  userAgentId: id,
  sessionKey,
  turnId: id,
  epoch: z.number().int().min(0),
  kind: z.enum(["permission", "question"]),
  mode: z.literal("blocking"),
  /** With userAgentId and turnId, makes a repeated open return the same request. */
  nativeRequestId: z.string().min(1).max(500),
  anchorMessageId: id.optional(),
  conversationId: id.optional(),
  threadId: id.optional(),
  payload: z.discriminatedUnion("type", [approvalPayload, questionsPayload]),
});

export const closeRequestInput = z.strictObject({
  ...device,
  requestId: id,
  status: z.enum(["delivered", "cancelled", "expired", "orphaned"]),
});

export const requestAnswersInput = z.strictObject(device);
