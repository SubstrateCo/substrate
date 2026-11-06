import {
  workspaceInput,
  messageListInput,
  conversationInput,
  messageInput,
  reactionInput,
  membersInput,
} from "@startup-os/contracts/messaging/input";
import { createMessagingService } from "@startup-os/database/messaging";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import type { z } from "zod";

async function serviceForSession(headers: Headers, organizationId: string) {
  const { session } = await workspaceSession(headers, organizationId);
  return createMessagingService(db, { userId: session.user.id, organizationId });
}

export function listConversations(headers: Headers, raw: z.input<typeof workspaceInput>) {
  return serviceResult(async () => {
    const input = workspaceInput.parse(raw);
    const service = await serviceForSession(headers, input.organizationId);
    return service.listConversations();
  });
}

export function listMessages(headers: Headers, raw: z.input<typeof messageListInput>) {
  return serviceResult(async () => {
    const input = messageListInput.parse(raw);
    const service = await serviceForSession(headers, input.organizationId);
    return service.listMessages(input.conversationId, input.threadId, input);
  });
}

export function createConversation(headers: Headers, raw: z.input<typeof conversationInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const input = conversationInput.parse(raw);
    const service = await serviceForSession(headers, input.organizationId);
    return service.createConversation(input);
  });
}

export function sendMessage(headers: Headers, raw: z.input<typeof messageInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const input = messageInput.parse(raw);
    const service = await serviceForSession(headers, input.organizationId);
    return service.sendMessage(input.conversationId, input.body, input.threadId, input.requestId);
  });
}

export function toggleReaction(headers: Headers, raw: z.input<typeof reactionInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const input = reactionInput.parse(raw);
    const service = await serviceForSession(headers, input.organizationId);
    return service.toggleReaction(input.messageId, input.emoji);
  });
}

export function addMembers(headers: Headers, raw: z.input<typeof membersInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const input = membersInput.parse(raw);
    const service = await serviceForSession(headers, input.organizationId);
    return service.addMembers(input.conversationId, input.emails);
  });
}
