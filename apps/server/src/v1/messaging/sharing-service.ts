import type { conversationTargetInput, workspaceInput } from "@substrate/contracts/messaging/input";
import type {
  sharingAcceptInput,
  sharingActionInput,
  sharingDisconnectInput,
  sharingInviteInput,
  sharingInvitationInput,
  sharingRemoveInput,
} from "@substrate/contracts/messaging/sharing";

import type { UserScope, WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { CommittedPublisher } from "../realtime/committed";
import type { z } from "zod";

export function createSharingService({ publish }: { publish: CommittedPublisher }) {
  return {
    getInvitation(this: void, scope: UserScope, input: z.output<typeof sharingInvitationInput>) {
      return serviceResult(() => scope.owner.sharing.invitation(input.invitationId));
    },
    acceptInvitation(this: void, scope: UserScope, input: z.output<typeof sharingAcceptInput>) {
      // Accept selects a destination workspace, not necessarily the active one. The database
      // checks destination membership under the invitation transaction's locks.
      return serviceResult(async () =>
        publish(
          await scope.owner.sharing.accept(
            input.invitationId,
            input.organizationId,
            input.shareHistory,
          ),
        ),
      );
    },
    declineInvitation(
      this: void,
      scope: UserScope,
      input: z.output<typeof sharingInvitationInput>,
    ) {
      return serviceResult(async () =>
        publish(await scope.owner.sharing.decline(input.invitationId)),
      );
    },
    invite(this: void, scope: WorkspaceScope, input: z.output<typeof sharingInviteInput>) {
      return serviceResult(async () => ({
        id: (await publish(await scope.repositories.sharing.invite(input.conversationId, input)))
          .id,
      }));
    },
    revoke(this: void, scope: WorkspaceScope, input: z.output<typeof sharingActionInput>) {
      return serviceResult(async () =>
        publish(await scope.repositories.sharing.revoke(input.invitationId)),
      );
    },
    resend(this: void, scope: WorkspaceScope, input: z.output<typeof sharingActionInput>) {
      return serviceResult(async () => ({
        id: (await publish(await scope.repositories.sharing.resend(input.invitationId))).id,
      }));
    },
    disconnect(this: void, scope: WorkspaceScope, input: z.output<typeof sharingDisconnectInput>) {
      return serviceResult(async () =>
        publish(
          await scope.repositories.sharing.disconnect(
            input.conversationId,
            input.partnerOrganizationId,
          ),
        ),
      );
    },
    remove(this: void, scope: WorkspaceScope, input: z.output<typeof sharingRemoveInput>) {
      return serviceResult(async () =>
        publish(await scope.repositories.sharing.remove(input.conversationId, input.actorId)),
      );
    },
    list(this: void, scope: WorkspaceScope, input: z.output<typeof conversationTargetInput>) {
      return serviceResult(() => scope.repositories.sharing.list(input.conversationId));
    },
    conversations(this: void, scope: WorkspaceScope, _input: z.output<typeof workspaceInput>) {
      return serviceResult(() => scope.repositories.sharing.listConversations());
    },
    inbox(this: void, scope: WorkspaceScope, _input: z.output<typeof workspaceInput>) {
      return serviceResult(() => scope.repositories.sharing.inbox());
    },
  };
}
export type SharingService = ReturnType<typeof createSharingService>;
