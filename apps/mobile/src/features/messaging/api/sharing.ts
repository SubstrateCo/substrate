import type { ConversationTarget } from "./conversations";
import { api } from "@/api/client";
import { readResult } from "@/api/result";

const sharing = api.messaging.sharing;
const init = (signal?: AbortSignal) => ({ init: { signal } });

export const getSharingDetails = (query: ConversationTarget, signal?: AbortSignal) =>
  readResult(sharing.details.$get({ query }, init(signal)));
export const listSharingInbox = (query: { organizationId: string }, signal?: AbortSignal) =>
  readResult(sharing.inbox.$get({ query }, init(signal)));
export const getSharingInvitation = (query: { invitationId: string }, signal?: AbortSignal) =>
  readResult(sharing.invitation.$get({ query }, init(signal)));
/** `shareHistory: true` records that the sender confirmed partners can read earlier messages. */
export const inviteSharing = (json: ConversationTarget & { email: string }) =>
  readResult(sharing.invite.$post({ json: { ...json, shareHistory: true } }));
export const resendSharing = (json: { organizationId: string; invitationId: string }) =>
  readResult(sharing.resend.$post({ json }));
export const revokeSharing = (json: { organizationId: string; invitationId: string }) =>
  readResult(sharing.revoke.$post({ json }));
export const disconnectSharing = (json: ConversationTarget & { partnerOrganizationId: string }) =>
  readResult(sharing.disconnect.$post({ json }));
export const removeSharing = (json: ConversationTarget & { actorId: string }) =>
  readResult(sharing.remove.$post({ json }));
/** `shareHistory: true` records that the recipient confirmed they can read the full history. */
export const acceptSharingInvitation = (json: { invitationId: string; organizationId: string }) =>
  readResult(sharing.accept.$post({ json: { ...json, shareHistory: true } }));
export const declineSharingInvitation = (json: { invitationId: string }) =>
  readResult(sharing.decline.$post({ json }));
