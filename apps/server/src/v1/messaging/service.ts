import type {
  workspaceInput,
  messageListInput,
  conversationInput,
  messageInput,
  reactionInput,
  membersInput,
  profileInput,
  conversationTargetInput,
  leaveInput,
  ownerInput,
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

export function listConversations(headers: Headers, input: z.output<typeof workspaceInput>) {
  return serviceResult(async () => {
    const service = await serviceForSession(headers, input.organizationId);
    return service.listConversations();
  });
}

export function listMessages(headers: Headers, input: z.output<typeof messageListInput>) {
  return serviceResult(async () => {
    const service = await serviceForSession(headers, input.organizationId);
    return service.listMessages(input.conversationId, input.threadId, input);
  });
}

export function getProfile(headers: Headers, input: z.output<typeof profileInput>) {
  return serviceResult(async () => {
    const service = await serviceForSession(headers, input.organizationId);
    return service.getProfile(input.conversationId, input.actorId);
  });
}

export function createConversation(headers: Headers, input: z.output<typeof conversationInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const service = await serviceForSession(headers, input.organizationId);
    const conversation = await service.createConversation(input);
    await publishRefresh([
      { audience: realtimeKeys.conversation(conversation.id), domain: "messaging" },
    ]);
    return conversation;
  });
}

export function sendMessage(headers: Headers, input: z.output<typeof messageInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
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

export function toggleReaction(headers: Headers, input: z.output<typeof reactionInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const service = await serviceForSession(headers, input.organizationId);
    const result = await service.toggleReaction(input.messageId, input.emoji);
    await publishRefresh(messageRefreshHints(db, input.messageId));
    return result;
  });
}

// Admins may manage conversations they cannot read, so the organization audience also gets the
// change. It carries no conversation ID or content.
function managementHints(input: { organizationId: string; conversationId: string }) {
  return [
    { audience: realtimeKeys.conversation(input.conversationId), domain: "messaging" as const },
    { audience: realtimeKeys.organization(input.organizationId), domain: "messaging" as const },
  ];
}

export function addMembers(headers: Headers, input: z.output<typeof membersInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const service = await serviceForSession(headers, input.organizationId);
    const result = await service.addMembers(input.conversationId, input.emails);
    await publishRefresh(managementHints(input));
    return result;
  });
}

export function listManagedConversations(headers: Headers, input: z.output<typeof workspaceInput>) {
  return serviceResult(async () => {
    const service = await serviceForSession(headers, input.organizationId);
    return service.listManagedConversations();
  });
}

export function joinConversation(
  headers: Headers,
  input: z.output<typeof conversationTargetInput>,
) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const service = await serviceForSession(headers, input.organizationId);
    const result = await service.joinConversation(input.conversationId);
    await publishRefresh([
      { audience: realtimeKeys.conversation(input.conversationId), domain: "messaging" },
    ]);
    return result;
  });
}

export function leaveConversation(headers: Headers, input: z.output<typeof leaveInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { session } = await workspaceSession(headers, input.organizationId);
    const service = createMessagingService(db, {
      userId: session.user.id,
      organizationId: input.organizationId,
    });
    const result = await service.leaveConversation(input.conversationId, input.newOwnerUserId);
    // The leaver may no longer pass the conversation audience check.
    await publishRefresh([
      ...managementHints(input),
      { audience: realtimeKeys.user(session.user.id), domain: "messaging" },
    ]);
    return result;
  });
}

export function transferOwnership(headers: Headers, input: z.output<typeof ownerInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const service = await serviceForSession(headers, input.organizationId);
    const result = await service.transferOwnership(input.conversationId, input.userId);
    await publishRefresh(managementHints(input));
    return result;
  });
}

export function deleteImpact(headers: Headers, input: z.output<typeof conversationTargetInput>) {
  return serviceResult(async () => {
    const service = await serviceForSession(headers, input.organizationId);
    return service.deleteImpact(input.conversationId);
  });
}

export function deleteConversation(
  headers: Headers,
  input: z.output<typeof conversationTargetInput>,
) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const service = await serviceForSession(headers, input.organizationId);
    const { hints } = await service.deleteConversation(input.conversationId);
    await publishRefresh(hints);
    return { deleted: true };
  });
}
