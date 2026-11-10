import type {
  conversationTargetInput,
  workspaceInput,
} from "@startup-os/contracts/messaging/input";
import type {
  sharingAcceptInput,
  sharingActionInput,
  sharingDisconnectInput,
  sharingInviteInput,
  sharingInvitationInput,
  sharingRemoveInput,
} from "@startup-os/contracts/messaging/sharing";
import { realtimeKeys } from "@startup-os/contracts/realtime";
import { createSharingService, readSharingInvitation } from "@startup-os/database/messaging";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { ServiceError, serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import { publishRefresh } from "../realtime/publisher";
import { deliverSharingMail } from "./sharing-mail";
import type { z } from "zod";

async function verified(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new ServiceError("UNAUTHENTICATED", "Sign in to continue.");
  if (!session.user.emailVerified)
    throw new ServiceError("FORBIDDEN", "Verify your email to continue.");
  return session;
}
async function service(headers: Headers, organizationId: string) {
  const { session } = await workspaceSession(headers, organizationId);
  return createSharingService(db, { userId: session.user.id, organizationId });
}
async function changed(organizationId: string, userId?: string) {
  await publishRefresh([
    { audience: realtimeKeys.organization(organizationId), domain: "access" },
    ...(userId ? [{ audience: realtimeKeys.user(userId), domain: "access" as const }] : []),
  ]);
}
export function getInvitation(headers: Headers, input: z.output<typeof sharingInvitationInput>) {
  return serviceResult(async () =>
    readSharingInvitation(db, (await verified(headers)).user.id, input.invitationId),
  );
}
export function acceptInvitation(headers: Headers, input: z.output<typeof sharingAcceptInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const session = await verified(headers);
    const { hints, ...result } = await createSharingService(db, {
      userId: session.user.id,
      organizationId: input.organizationId,
    }).accept(input.invitationId, input.shareHistory);
    await publishRefresh(hints);
    await changed(input.organizationId, session.user.id);
    return result;
  });
}
export function declineInvitation(
  headers: Headers,
  input: z.output<typeof sharingInvitationInput>,
) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const session = await verified(headers);
    const { hints, ...result } = await createSharingService(db, {
      userId: session.user.id,
      organizationId: session.session.activeOrganizationId ?? "",
    }).decline(input.invitationId);
    await publishRefresh(hints);
    return result;
  });
}
export function invite(headers: Headers, input: z.output<typeof sharingInviteInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const created = await (
      await service(headers, input.organizationId)
    ).invite(input.conversationId, input);
    await deliverSharingMail();
    await publishRefresh(created.hints);
    await changed(input.organizationId);
    return { id: created.id };
  });
}
export function revoke(headers: Headers, input: z.output<typeof sharingActionInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { hints, ...result } = await (
      await service(headers, input.organizationId)
    ).revoke(input.invitationId);
    await publishRefresh(hints);
    await changed(input.organizationId);
    return result;
  });
}
export function resend(headers: Headers, input: z.output<typeof sharingActionInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const result = await (await service(headers, input.organizationId)).resend(input.invitationId);
    await publishRefresh(result.hints);
    await deliverSharingMail();
    await changed(input.organizationId);
    return { id: result.id };
  });
}
export function disconnect(headers: Headers, input: z.output<typeof sharingDisconnectInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { hints, ...result } = await (
      await service(headers, input.organizationId)
    ).disconnect(input.conversationId, input.partnerOrganizationId);
    await publishRefresh(hints);
    await changed(input.organizationId);
    return result;
  });
}
export function remove(headers: Headers, input: z.output<typeof sharingRemoveInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { hints, ...result } = await (
      await service(headers, input.organizationId)
    ).remove(input.conversationId, input.actorId);
    await publishRefresh(hints);
    return result;
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
