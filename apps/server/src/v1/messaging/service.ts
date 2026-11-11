import type {
  workspaceInput,
  messageListInput,
  conversationInput,
  messageInput,
  reactionInput,
  reactionListInput,
  membersInput,
  profileInput,
  conversationTargetInput,
  leaveInput,
  ownerInput,
  addAgentInput,
  removeAgentInput,
} from "@substrate/contracts/messaging/input";
import { realtimeKeys } from "@substrate/contracts/realtime";
import { createMessagingService } from "@substrate/database/messaging";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import { publishRefresh } from "../realtime/publisher";
import { deliverSharingMail } from "./sharing-mail";
import type { z } from "zod";

async function serviceForSession(headers: Headers, organizationId: string) {
  const { session } = await workspaceSession(headers, organizationId);
  return {
    service: createMessagingService(db, { userId: session.user.id, organizationId }),
    session,
  };
}

export function listConversations(headers: Headers, input: z.output<typeof workspaceInput>) {
  return serviceResult(async () => {
    const { service } = await serviceForSession(headers, input.organizationId);
    return service.listConversations();
  });
}

export function listMessages(headers: Headers, input: z.output<typeof messageListInput>) {
  return serviceResult(async () => {
    const { service } = await serviceForSession(headers, input.organizationId);
    return service.listMessages(input.conversationId, input.threadId, input);
  });
}

export function getProfile(headers: Headers, input: z.output<typeof profileInput>) {
  return serviceResult(async () => {
    const { service } = await serviceForSession(headers, input.organizationId);
    return service.getProfile(input.conversationId, input.actorId);
  });
}

export function createConversation(headers: Headers, input: z.output<typeof conversationInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { service } = await serviceForSession(headers, input.organizationId);
    const conversation = await service.createConversation(input);
    void deliverSharingMail();
    await publishRefresh([
      { audience: realtimeKeys.conversation(conversation.id), domain: "messaging" },
    ]);
    return conversation;
  });
}

export function sendMessage(headers: Headers, input: z.output<typeof messageInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { service } = await serviceForSession(headers, input.organizationId);
    const message = await service.sendMessage(
      input.conversationId,
      input.body,
      input.threadId,
      input.requestId,
      input.attachmentFileIds,
    );
    // Hints include an agent-work hint to the author's desktops when the message woke an agent.
    const { hints, ...sent } = message;
    await publishRefresh(hints);
    return sent;
  });
}

export function addAgent(headers: Headers, input: z.output<typeof addAgentInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { service } = await serviceForSession(headers, input.organizationId);
    const result = await service.addAgent(input.conversationId, input.agentId);
    await publishRefresh([
      { audience: realtimeKeys.conversation(input.conversationId), domain: "messaging" },
    ]);
    return result;
  });
}

export function removeAgent(headers: Headers, input: z.output<typeof removeAgentInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { service } = await serviceForSession(headers, input.organizationId);
    const result = await service.removeAgent(input.conversationId, input.actorId);
    await publishRefresh([
      { audience: realtimeKeys.conversation(input.conversationId), domain: "messaging" },
    ]);
    return result;
  });
}

export function listReactions(headers: Headers, input: z.output<typeof reactionListInput>) {
  return serviceResult(async () => {
    const { service } = await serviceForSession(headers, input.organizationId);
    return service.listReactions(input.messageId, input);
  });
}

export function toggleReaction(headers: Headers, input: z.output<typeof reactionInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { service } = await serviceForSession(headers, input.organizationId);
    const { hints, ...result } = await service.toggleReaction(input.messageId, input.emoji);
    await publishRefresh(hints);
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
    const { service } = await serviceForSession(headers, input.organizationId);
    const result = await service.addMembers(input.conversationId, input.emails, input.shareHistory);
    void deliverSharingMail();
    await publishRefresh(managementHints(input));
    return result;
  });
}

export function listManagedConversations(headers: Headers, input: z.output<typeof workspaceInput>) {
  return serviceResult(async () => {
    const { service } = await serviceForSession(headers, input.organizationId);
    return service.listManagedConversations();
  });
}

export function joinConversation(
  headers: Headers,
  input: z.output<typeof conversationTargetInput>,
) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { service } = await serviceForSession(headers, input.organizationId);
    const { changed, ...result } = await service.joinConversation(input.conversationId);
    // Joining as a current member changes nothing that viewers need to refresh.
    if (changed)
      await publishRefresh([
        { audience: realtimeKeys.conversation(input.conversationId), domain: "messaging" },
      ]);
    return result;
  });
}

export function leaveConversation(headers: Headers, input: z.output<typeof leaveInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { service, session } = await serviceForSession(headers, input.organizationId);
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
    const { service } = await serviceForSession(headers, input.organizationId);
    const result = await service.transferOwnership(input.conversationId, input.userId);
    await publishRefresh(managementHints(input));
    return result;
  });
}

export function deleteImpact(headers: Headers, input: z.output<typeof conversationTargetInput>) {
  return serviceResult(async () => {
    const { service } = await serviceForSession(headers, input.organizationId);
    return service.deleteImpact(input.conversationId);
  });
}

export function deleteConversation(
  headers: Headers,
  input: z.output<typeof conversationTargetInput>,
) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { service } = await serviceForSession(headers, input.organizationId);
    const { hints } = await service.deleteConversation(input.conversationId);
    await publishRefresh(hints);
    return { deleted: true };
  });
}
