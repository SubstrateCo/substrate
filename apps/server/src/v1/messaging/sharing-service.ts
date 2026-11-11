import type { conversationTargetInput, workspaceInput } from "@substrate/contracts/messaging/input";
import type {
  sharingAcceptInput,
  sharingActionInput,
  sharingDisconnectInput,
  sharingInviteInput,
  sharingInvitationInput,
  sharingRemoveInput,
} from "@substrate/contracts/messaging/sharing";
import { createRepositories } from "@substrate/database";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, requireVerified, workspaceSession } from "../../shared/workspace";
import { publishCommitted } from "../realtime/committed";
import type { z } from "zod";

async function verified(headers: Headers) {
  return requireVerified(await auth.api.getSession({ headers }));
}
async function service(headers: Headers, organizationId: string) {
  const { session } = await workspaceSession(headers, organizationId);
  // Invitations lock the conversation before the manager check, so check membership first.
  await auth.api.getActiveMemberRole({ headers, query: { organizationId } });
  return (await createRepositories(db).forSession({ userId: session.user.id, organizationId }))
    .sharing;
}
export function getInvitation(headers: Headers, input: z.output<typeof sharingInvitationInput>) {
  return serviceResult(async () =>
    (
      await createRepositories(db).forOwnerSession({ userId: (await verified(headers)).user.id })
    ).sharing.invitation(input.invitationId),
  );
}
export function acceptInvitation(headers: Headers, input: z.output<typeof sharingAcceptInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const session = await verified(headers);
    return publishCommitted(
      await (
        await createRepositories(db).forOwnerSession({
          userId: session.user.id,
        })
      ).sharing.accept(input.invitationId, input.organizationId, input.shareHistory),
    );
  });
}
export function declineInvitation(
  headers: Headers,
  input: z.output<typeof sharingInvitationInput>,
) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const session = await verified(headers);
    return publishCommitted(
      await (
        await createRepositories(db).forOwnerSession({ userId: session.user.id })
      ).sharing.decline(input.invitationId),
    );
  });
}
export function invite(headers: Headers, input: z.output<typeof sharingInviteInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const created = await publishCommitted(
      await (await service(headers, input.organizationId)).invite(input.conversationId, input),
    );
    return { id: created.id };
  });
}
export function revoke(headers: Headers, input: z.output<typeof sharingActionInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    return publishCommitted(
      await (await service(headers, input.organizationId)).revoke(input.invitationId),
    );
  });
}
export function resend(headers: Headers, input: z.output<typeof sharingActionInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const result = await publishCommitted(
      await (await service(headers, input.organizationId)).resend(input.invitationId),
    );
    return { id: result.id };
  });
}
export function disconnect(headers: Headers, input: z.output<typeof sharingDisconnectInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    return publishCommitted(
      await (
        await service(headers, input.organizationId)
      ).disconnect(input.conversationId, input.partnerOrganizationId),
    );
  });
}
export function remove(headers: Headers, input: z.output<typeof sharingRemoveInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    return publishCommitted(
      await (
        await service(headers, input.organizationId)
      ).remove(input.conversationId, input.actorId),
    );
  });
}
export function list(headers: Headers, input: z.output<typeof conversationTargetInput>) {
  return serviceResult(async () =>
    (await service(headers, input.organizationId)).list(input.conversationId),
  );
}
export function conversations(headers: Headers, input: z.output<typeof workspaceInput>) {
  return serviceResult(async () =>
    (await service(headers, input.organizationId)).listConversations(),
  );
}
export function inbox(headers: Headers, input: z.output<typeof workspaceInput>) {
  return serviceResult(async () => (await service(headers, input.organizationId)).inbox());
}
