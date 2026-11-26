import type { SearchInput } from "./api/context";
import { queryKeys, type QueryScope } from "@/queries/keys";

/** Every messaging query is private to the signed-in user and scoped to one workspace. */
export const messagingKeys = {
  all: (scope: QueryScope) => queryKeys.domain(scope, "messaging"),
  conversations: (scope: QueryScope, selectedId?: string) =>
    [...messagingKeys.all(scope), "conversations", selectedId ?? null] as const,
  unread: (scope: QueryScope) => [...messagingKeys.all(scope), "unread"] as const,
  messages: (scope: QueryScope, conversationId: string, threadId?: string) =>
    [...messagingKeys.all(scope), "messages", conversationId, threadId ?? null] as const,
  threadRoot: (scope: QueryScope, conversationId: string, threadId: string) =>
    [...messagingKeys.all(scope), "thread-root", conversationId, threadId] as const,
  context: (scope: QueryScope, conversationId: string, messageIds: readonly string[]) =>
    [...messagingKeys.all(scope), "context", conversationId, messageIds] as const,
  reactions: (scope: QueryScope, messageId: string, emoji: string) =>
    [...messagingKeys.all(scope), "reactions", messageId, emoji] as const,
  deleteImpact: (scope: QueryScope, conversationId: string) =>
    [...messagingKeys.all(scope), "delete-impact", conversationId] as const,
  managed: (scope: QueryScope) => [...messagingKeys.all(scope), "managed"] as const,
  profile: (scope: QueryScope, conversationId: string, actorId: string) =>
    [...messagingKeys.all(scope), "profile", conversationId, actorId] as const,
  target: (scope: QueryScope, conversationId: string, messageId: string) =>
    [...messagingKeys.all(scope), "target", conversationId, messageId] as const,
  apps: (scope: QueryScope) => [...messagingKeys.all(scope), "apps"] as const,
  sharing: (scope: QueryScope, conversationId: string) =>
    [...messagingKeys.all(scope), "sharing", conversationId] as const,
  sharingInbox: (scope: QueryScope) => [...messagingKeys.all(scope), "sharing-inbox"] as const,
  sharingInvitation: (scope: QueryScope, invitationId: string) =>
    [...messagingKeys.all(scope), "sharing-invitation", invitationId] as const,
  searchAll: (scope: QueryScope) => queryKeys.domain(scope, "search"),
  search: (scope: QueryScope, input: SearchInput) =>
    [...queryKeys.domain(scope, "search"), input] as const,
  people: (scope: QueryScope) => [...queryKeys.domain(scope, "people"), "list"] as const,
  agents: (scope: QueryScope) => [...queryKeys.account(scope.userId), "agents"] as const,
};
