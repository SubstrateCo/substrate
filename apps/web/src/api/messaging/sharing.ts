import type { conversationTargetInput, workspaceInput } from "@substrate/contracts/messaging/input";
import type {
  sharingAcceptInput,
  sharingActionInput,
  sharingDisconnectInput,
  sharingInviteInput,
  sharingInvitationInput,
  sharingRemoveInput,
} from "@substrate/contracts/messaging/sharing";

import { api, type ApiInput } from "@/api/client";
import { readResult } from "@/api/result";
import type { z } from "zod";

const sharing = api.messaging.sharing;
export const getSharingInvitation = ({
  data,
  signal,
}: ApiInput<z.input<typeof sharingInvitationInput>>) =>
  readResult(sharing.invitation.$get({ query: data }, { init: { signal } }));
export type SharingInvitation = Awaited<ReturnType<typeof getSharingInvitation>>;
export const acceptSharingInvitation = ({ data }: ApiInput<z.input<typeof sharingAcceptInput>>) =>
  readResult(sharing.accept.$post({ json: data }));
export type SharingAcceptance = Awaited<ReturnType<typeof acceptSharingInvitation>>;
export const declineSharingInvitation = ({
  data,
}: ApiInput<z.input<typeof sharingInvitationInput>>) =>
  readResult(sharing.decline.$post({ json: data }));
export const inviteSharing = ({ data }: ApiInput<z.input<typeof sharingInviteInput>>) =>
  readResult(sharing.invite.$post({ json: data }));
export const revokeSharing = ({ data }: ApiInput<z.input<typeof sharingActionInput>>) =>
  readResult(sharing.revoke.$post({ json: data }));
export const resendSharing = ({ data }: ApiInput<z.input<typeof sharingActionInput>>) =>
  readResult(sharing.resend.$post({ json: data }));
export const disconnectSharing = ({ data }: ApiInput<z.input<typeof sharingDisconnectInput>>) =>
  readResult(sharing.disconnect.$post({ json: data }));
export const removeSharing = ({ data }: ApiInput<z.input<typeof sharingRemoveInput>>) =>
  readResult(sharing.remove.$post({ json: data }));
export const listSharing = ({ data, signal }: ApiInput<z.input<typeof conversationTargetInput>>) =>
  readResult(sharing.details.$get({ query: data }, { init: { signal } }));
export const listSharingConversations = ({
  data,
  signal,
}: ApiInput<z.input<typeof workspaceInput>>) =>
  readResult(sharing.conversations.$get({ query: data }, { init: { signal } }));
export type SharedConversation = Awaited<ReturnType<typeof listSharingConversations>>[number];
export const listSharingInbox = ({ data, signal }: ApiInput<z.input<typeof workspaceInput>>) =>
  readResult(sharing.inbox.$get({ query: data }, { init: { signal } }));
export type SharingRequest = Awaited<ReturnType<typeof listSharingInbox>>[number];
export type SharingDetails = Awaited<ReturnType<typeof listSharing>>;
