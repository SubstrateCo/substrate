import { createMessagingService } from "@startup-os/database/messaging";
import { db } from "./database";
import { authEnvironment } from "./environment";
import { messagingRead, messagingWorkspace, messagingWrite } from "./messaging-contract";
import { requireMessagingOrigin, requireMessagingWorkspace } from "./messaging-policy";
import { auth } from "./server";
import type { z } from "zod";

type Service = ReturnType<typeof createMessagingService>;
type ReadInput = z.input<typeof messagingRead>;
type WriteInput = z.input<typeof messagingWrite>;
type Scoped<T> = T & { organizationId: string };
type ReadRequest = Scoped<ReadInput>;
type WriteRequest = Scoped<WriteInput>;
const { baseURL } = authEnvironment();

async function serviceForSession(headers: Headers, expectedOrganizationId: string) {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error("Sign in to continue.");
  if (!session.user.emailVerified) throw new Error("Verify your email to continue.");
  const organizationId = requireMessagingWorkspace(
    expectedOrganizationId,
    session.session.activeOrganizationId,
  );
  await auth.api.getActiveMemberRole({ headers, query: { organizationId } });
  return createMessagingService(db, { userId: session.user.id, organizationId });
}

async function execute<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Error && error.name === "AccessDeniedError") {
      throw new Error("Conversation not found or access denied.");
    }
    if (error instanceof Error && ["ValidationError", "ConflictError"].includes(error.name)) {
      throw new Error(error.message);
    }
    console.error(
      "Messaging operation failed",
      error instanceof Error ? error.name : "Unknown error",
    );
    throw new Error("Messaging is unavailable. Please try again.");
  }
}

export function readMessaging(
  headers: Headers,
  raw: Scoped<Extract<ReadInput, { action: "conversations" }>>,
): ReturnType<Service["listConversations"]>;
export function readMessaging(
  headers: Headers,
  raw: Scoped<Extract<ReadInput, { action: "messages" }>>,
): ReturnType<Service["listMessages"]>;
export async function readMessaging(headers: Headers, raw: ReadRequest) {
  const input = messagingRead.safeParse(raw);
  const workspace = messagingWorkspace.safeParse(raw);
  if (!input.success || !workspace.success) throw new Error("Invalid messaging request.");
  const service = await serviceForSession(headers, workspace.data.organizationId);
  const data = input.data;
  if (data.action === "conversations") return execute(() => service.listConversations());
  return execute(() => service.listMessages(data.conversationId, data.threadId, data));
}

export function writeMessaging(
  headers: Headers,
  raw: Scoped<Extract<WriteInput, { action: "create" }>>,
): ReturnType<Service["createConversation"]>;
export function writeMessaging(
  headers: Headers,
  raw: Scoped<Extract<WriteInput, { action: "send" }>>,
): ReturnType<Service["sendMessage"]>;
export function writeMessaging(
  headers: Headers,
  raw: Scoped<Extract<WriteInput, { action: "react" }>>,
): ReturnType<Service["toggleReaction"]>;
export function writeMessaging(
  headers: Headers,
  raw: Scoped<Extract<WriteInput, { action: "addMembers" }>>,
): ReturnType<Service["addMembers"]>;
export async function writeMessaging(headers: Headers, raw: WriteRequest) {
  requireMessagingOrigin(headers.get("origin"), baseURL);
  const input = messagingWrite.safeParse(raw);
  const workspace = messagingWorkspace.safeParse(raw);
  if (!input.success || !workspace.success) throw new Error("Invalid messaging request.");
  const service = await serviceForSession(headers, workspace.data.organizationId);
  const data = input.data;
  switch (data.action) {
    case "create":
      return execute(() => service.createConversation(data));
    case "send":
      return execute(() =>
        service.sendMessage(data.conversationId, data.body, data.threadId, data.requestId),
      );
    case "react":
      return execute(() => service.toggleReaction(data.messageId, data.emoji));
    case "addMembers":
      return execute(() => service.addMembers(data.conversationId, data.emails));
  }
}
