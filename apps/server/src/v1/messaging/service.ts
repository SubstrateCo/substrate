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
import { createRepositories } from "@substrate/database";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import { publishCommitted } from "../realtime/committed";
import type { z } from "zod";

async function serviceForSession(headers: Headers, organizationId: string) {
  const { session } = await workspaceSession(headers, organizationId);
  return {
    service: (await createRepositories(db).forSession({ userId: session.user.id, organizationId }))
      .messaging,
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
    return publishCommitted(await service.createConversation(input));
  });
}

export function sendMessage(headers: Headers, input: z.output<typeof messageInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { service } = await serviceForSession(headers, input.organizationId);
    return publishCommitted(
      await service.sendMessage(
        input.conversationId,
        input.body,
        input.threadId,
        input.requestId,
        input.attachmentFileIds,
      ),
    );
  });
}

export function addAgent(headers: Headers, input: z.output<typeof addAgentInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { service } = await serviceForSession(headers, input.organizationId);
    return publishCommitted(await service.addAgent(input.conversationId, input.agentId));
  });
}

export function removeAgent(headers: Headers, input: z.output<typeof removeAgentInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { service } = await serviceForSession(headers, input.organizationId);
    return publishCommitted(await service.removeAgent(input.conversationId, input.actorId));
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
    return publishCommitted(await service.toggleReaction(input.messageId, input.emoji));
  });
}

export function addMembers(headers: Headers, input: z.output<typeof membersInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { service } = await serviceForSession(headers, input.organizationId);
    return publishCommitted(
      await service.addMembers(input.conversationId, input.emails, input.shareHistory),
    );
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
    const { changed: _, ...result } = await publishCommitted(
      await service.joinConversation(input.conversationId),
    );
    return result;
  });
}

export function leaveConversation(headers: Headers, input: z.output<typeof leaveInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { service } = await serviceForSession(headers, input.organizationId);
    return publishCommitted(
      await service.leaveConversation(input.conversationId, input.newOwnerUserId),
    );
  });
}

export function transferOwnership(headers: Headers, input: z.output<typeof ownerInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { service } = await serviceForSession(headers, input.organizationId);
    return publishCommitted(await service.transferOwnership(input.conversationId, input.userId));
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
    await publishCommitted(await service.deleteConversation(input.conversationId));
    return { deleted: true };
  });
}
