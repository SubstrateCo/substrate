import { organizationId } from "../workspace.ts";
import { agentRequestPayload } from "./requests.ts";
import { z } from "zod";

// Home desktop calls under /agent-work/device/*. The session decides the user; the server checks
// the registered device and derives every agent from it. Bodies never name the owner.

const id = z.uuid();
const device = { organizationId, installationId: id };

export const registerDeviceInput = z.strictObject({
  installationId: id,
  name: z.string().trim().min(1).max(200),
  platform: z.string().trim().min(1).max(40),
});

/** Keeps the device online while realtime makes polling unnecessary. */
export const deviceHeartbeatInput = z.strictObject({ installationId: id });

export const sourcesInput = z.strictObject({
  ...device,
  messageIds: z.array(id).min(1).max(100),
});

const [approvalPayload, questionsPayload] = agentRequestPayload.options;

/** Native blocking prompts only. Async questions and proposals start from MCP tools. */
export const openRequestInput = z.strictObject({
  ...device,
  /** A live turn this device holds. The server derives the agent and session from it. */
  turnId: id,
  epoch: z.number().int().min(0),
  kind: z.enum(["permission", "question"]),
  mode: z.literal("blocking"),
  /** With turnId, makes a repeated open return the same request. */
  nativeRequestId: z.string().min(1).max(500),
  anchorMessageId: id.optional(),
  conversationId: id.optional(),
  threadId: id.optional(),
  payload: z.discriminatedUnion("type", [approvalPayload, questionsPayload]),
});

export type OpenRequestKind = z.output<typeof openRequestInput>["kind"];

export const closeRequestInput = z.strictObject({
  ...device,
  requestId: id,
  status: z.enum(["delivered", "cancelled", "expired", "orphaned"]),
});
export type CloseRequestStatus = z.output<typeof closeRequestInput>["status"];

export const requestAnswersInput = z.strictObject(device);

/** Asks whether the owner can see a place, such as a routine's destination, before saving it. */
export const placeAccessInput = z.strictObject({
  ...device,
  conversationId: id,
  threadId: id.nullable(),
});
