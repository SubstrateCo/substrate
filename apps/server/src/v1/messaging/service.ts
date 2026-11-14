import type {
  workspaceInput,
  conversationListInput,
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
  removeMemberInput,
  messageTargetInput,
  editMessageInput,
} from "@substrate/contracts/messaging/input";

import type { createCommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { z } from "zod";

export function createMessagingService({
  publish,
}: {
  publish: ReturnType<typeof createCommittedPublisher>;
}) {
  return {
    editMessage(this: void, scope: WorkspaceScope, input: z.output<typeof editMessageInput>) {
      return serviceResult(async () =>
        publish(await scope.repositories.messaging.editMessage(input.messageId, input.body)),
      );
    },
    deleteMessage(this: void, scope: WorkspaceScope, input: z.output<typeof messageTargetInput>) {
      return serviceResult(async () =>
        publish(await scope.repositories.messaging.deleteMessage(input.messageId)),
      );
    },
    removeMember(this: void, scope: WorkspaceScope, input: z.output<typeof removeMemberInput>) {
      return serviceResult(async () =>
        publish(
          await scope.repositories.messaging.removeMember(input.conversationId, input.actorId),
        ),
      );
    },
    listConversations(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof conversationListInput>,
    ) {
      return serviceResult(() =>
        scope.repositories.messaging.listConversations(input.conversationId),
      );
    },
    listMessages(this: void, scope: WorkspaceScope, input: z.output<typeof messageListInput>) {
      return serviceResult(() =>
        scope.repositories.messaging.listMessages(input.conversationId, input.threadId, input),
      );
    },
    getProfile(this: void, scope: WorkspaceScope, input: z.output<typeof profileInput>) {
      return serviceResult(() =>
        scope.repositories.messaging.getProfile(input.conversationId, input.actorId),
      );
    },
    createConversation(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof conversationInput>,
    ) {
      return serviceResult(async () =>
        publish(await scope.repositories.messaging.createConversation(input)),
      );
    },
    sendMessage(this: void, scope: WorkspaceScope, input: z.output<typeof messageInput>) {
      return serviceResult(async () =>
        publish(
          await scope.repositories.messaging.sendMessage(
            input.conversationId,
            input.body,
            input.threadId,
            input.requestId,
            input.attachmentFileIds,
          ),
        ),
      );
    },
    addAgent(this: void, scope: WorkspaceScope, input: z.output<typeof addAgentInput>) {
      return serviceResult(async () =>
        publish(await scope.repositories.messaging.addAgent(input.conversationId, input.agentId)),
      );
    },
    removeAgent(this: void, scope: WorkspaceScope, input: z.output<typeof removeAgentInput>) {
      return serviceResult(async () =>
        publish(
          await scope.repositories.messaging.removeAgent(input.conversationId, input.actorId),
        ),
      );
    },
    listReactions(this: void, scope: WorkspaceScope, input: z.output<typeof reactionListInput>) {
      return serviceResult(() =>
        scope.repositories.messaging.listReactions(input.messageId, input),
      );
    },
    toggleReaction(this: void, scope: WorkspaceScope, input: z.output<typeof reactionInput>) {
      return serviceResult(async () =>
        publish(await scope.repositories.messaging.toggleReaction(input.messageId, input.emoji)),
      );
    },
    addMembers(this: void, scope: WorkspaceScope, input: z.output<typeof membersInput>) {
      return serviceResult(async () =>
        publish(
          await scope.repositories.messaging.addMembers(
            input.conversationId,
            input.emails,
            input.shareHistory,
          ),
        ),
      );
    },
    listManagedConversations(
      this: void,
      scope: WorkspaceScope,
      _input: z.output<typeof workspaceInput>,
    ) {
      return serviceResult(() => scope.repositories.messaging.listManagedConversations());
    },
    joinConversation(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof conversationTargetInput>,
    ) {
      return serviceResult(async () => {
        const { changed: _, ...result } = await publish(
          await scope.repositories.messaging.joinConversation(input.conversationId),
        );
        return result;
      });
    },
    leaveConversation(this: void, scope: WorkspaceScope, input: z.output<typeof leaveInput>) {
      return serviceResult(async () =>
        publish(
          await scope.repositories.messaging.leaveConversation(
            input.conversationId,
            input.newOwnerUserId,
          ),
        ),
      );
    },
    transferOwnership(this: void, scope: WorkspaceScope, input: z.output<typeof ownerInput>) {
      return serviceResult(async () =>
        publish(
          await scope.repositories.messaging.transferOwnership(input.conversationId, input.userId),
        ),
      );
    },
    deleteImpact(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof conversationTargetInput>,
    ) {
      return serviceResult(() => scope.repositories.messaging.deleteImpact(input.conversationId));
    },
    deleteConversation(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof conversationTargetInput>,
    ) {
      return serviceResult(async () => {
        await publish(await scope.repositories.messaging.deleteConversation(input.conversationId));
        return { deleted: true };
      });
    },
  };
}
export type MessagingService = ReturnType<typeof createMessagingService>;
