import {
  workspaceInput,
  messageListInput,
  conversationInput,
  messageInput,
  reactionInput,
  membersInput,
} from "@startup-os/contracts/messaging/input";
import { realtimeKeys } from "@startup-os/contracts/realtime";
import { createMessagingService } from "@startup-os/database/messaging";
import { messageRefreshHints } from "@startup-os/database/realtime";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import { publishRefresh } from "../realtime/publisher";
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

export function listAvailableAgents(headers: Headers, raw: z.input<typeof workspaceInput>) {
  return serviceResult(async () => {
    const input = workspaceInput.parse(raw);
    return (await serviceForSession(headers, input.organizationId)).listAvailableAgents();
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
    const conversation = await service.createConversation(input);
    await publishRefresh([
      { audience: realtimeKeys.conversation(conversation.id), domain: "messaging" },
    ]);
    return conversation;
  });
}

export function sendMessage(headers: Headers, raw: z.input<typeof messageInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const input = messageInput.parse(raw);
    const service = await serviceForSession(headers, input.organizationId);
    const message = await service.sendMessage(
      input.conversationId,
      input.body,
      input.threadId,
      input.requestId,
    );
    await publishRefresh(
      messageRefreshHints(db, message.id).then((hints) => [
        ...hints,
        { audience: realtimeKeys.organization(input.organizationId), domain: "context" },
      ]),
    );
    return message;
  });
}

export function toggleReaction(headers: Headers, raw: z.input<typeof reactionInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const input = reactionInput.parse(raw);
    const service = await serviceForSession(headers, input.organizationId);
    const result = await service.toggleReaction(input.messageId, input.emoji);
    await publishRefresh(messageRefreshHints(db, input.messageId));
    return result;
  });
}

export function addMembers(headers: Headers, raw: z.input<typeof membersInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const input = membersInput.parse(raw);
    const service = await serviceForSession(headers, input.organizationId);
    const result = await service.addMembers(
      input.conversationId,
      input.emails,
      input.agentActorIds,
    );
    await publishRefresh([
      { audience: realtimeKeys.conversation(input.conversationId), domain: "messaging" },
    ]);
    return result;
  });
}
