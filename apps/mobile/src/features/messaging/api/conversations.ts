import { api } from "@/api/client";
import { readResult } from "@/api/result";

const messaging = api.messaging;
const conversations = messaging.conversations;

export type Json<T extends (...args: never[]) => object> = Parameters<T>[0] extends {
  json: infer Body;
}
  ? Body
  : never;
export type ConversationTarget = { organizationId: string; conversationId: string };
const init = (signal?: AbortSignal) => ({ init: { signal } });

export const listConversations = (
  query: { organizationId: string; conversationId?: string },
  signal?: AbortSignal,
) => readResult(conversations.$get({ query }, init(signal)));
export const createConversation = (json: Json<typeof conversations.$post>) =>
  readResult(conversations.$post({ json }));
export const listManagedConversations = (query: { organizationId: string }, signal?: AbortSignal) =>
  readResult(conversations.managed.$get({ query }, init(signal)));
export const getSettingsAccess = (signal?: AbortSignal) =>
  readResult(api.organizations["settings-access"].$get({}, init(signal)));
export const addMembers = (json: Json<typeof messaging.members.$post>) =>
  readResult(messaging.members.$post({ json }));
export const removeMember = (json: ConversationTarget & { actorId: string }) =>
  readResult(messaging.members.remove.$post({ json }));
export const addAgent = (json: ConversationTarget & { agentId: string }) =>
  readResult(messaging.agents.add.$post({ json }));
export const removeAgent = (json: ConversationTarget & { actorId: string }) =>
  readResult(messaging.agents.remove.$post({ json }));
export const joinConversation = (json: ConversationTarget) =>
  readResult(conversations.join.$post({ json }));
export const leaveConversation = (json: ConversationTarget & { newOwnerUserId?: string }) =>
  readResult(conversations.leave.$post({ json }));
export const transferOwnership = (json: ConversationTarget & { userId: string }) =>
  readResult(conversations.owner.$post({ json }));
export const deleteConversation = (json: ConversationTarget) =>
  readResult(conversations.delete.$post({ json }));
export const getDeleteImpact = (query: ConversationTarget, signal?: AbortSignal) =>
  readResult(conversations["delete-impact"].$get({ query }, init(signal)));
export const unreadCounts = (query: { organizationId: string }, signal?: AbortSignal) =>
  readResult(messaging.unread.$get({ query }, init(signal)));
export const markConversationRead = (json: ConversationTarget & { messageId: string }) =>
  readResult(messaging.read.$post({ json }));
/** A profile as this conversation lets the viewer see it. */
export const getMessagingProfile = (
  query: ConversationTarget & { actorId: string },
  signal?: AbortSignal,
) => readResult(messaging.profiles.$get({ query }, init(signal)));
