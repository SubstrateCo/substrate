import type { RealtimeEvent } from "@substrate/contracts/realtime";

import type { Query, QueryKey } from "@tanstack/react-query";

import { queryKeys, type QueryScope } from "../keys";
import { messagingKeys } from "@/features/messaging/keys";
import type { MessagingConversationTarget } from "@/features/messaging/types";

export type RealtimeChange = Extract<RealtimeEvent, { type: "change" }>;

export interface RealtimeTarget {
  queryKey: QueryKey;
  refetchType?: "none";
  predicate?: (query: Query) => boolean;
  history?: MessagingConversationTarget;
}

const includes = (part: string) => (query: Query) => query.queryKey.includes(part);

function searchTarget(
  scope: QueryScope,
  { refetch = false, messagesOnly = false } = {},
): RealtimeTarget {
  const target: RealtimeTarget = { queryKey: messagingKeys.searchAll(scope) };
  if (!refetch) target.refetchType = "none";
  if (messagesOnly)
    target.predicate = (query) => {
      // SAFETY: search keys end with their input.
      const input = query.queryKey.at(-1) as { kind?: string; kinds?: string[] } | undefined;
      return (input?.kinds ?? [input?.kind ?? "all"]).some((kind) =>
        ["all", "message", "thread", "conversation"].includes(kind),
      );
    };
  return target;
}

const relatedMessages = (scope: QueryScope): RealtimeTarget => ({
  queryKey: queryKeys.workspace(scope),
  predicate: includes("related-messages"),
});

function messagingTargets(scope: QueryScope, event: RealtimeChange): RealtimeTarget[] {
  const all = messagingKeys.all(scope);
  const { conversationId, messageId, threadId } = event;
  if (event.scope === "read") return [{ queryKey: messagingKeys.unread(scope) }];
  if (!conversationId)
    return [{ queryKey: all }, searchTarget(scope, { refetch: true }), relatedMessages(scope)];
  const histories = [...all, "messages", conversationId];
  const targets = [...all, "target", conversationId];
  if (event.scope === "reactions")
    return [
      { queryKey: histories },
      { queryKey: [...all, "thread-root", conversationId] },
      { queryKey: messageId ? [...all, "reactions", messageId] : [...all, "reactions"] },
      { queryKey: targets },
    ];
  if (event.scope !== "messages" || threadId === undefined)
    return [{ queryKey: all }, searchTarget(scope, { refetch: true }), relatedMessages(scope)];
  const timeline: MessagingConversationTarget = { conversationId };
  const history: RealtimeTarget[] = [
    { queryKey: messagingKeys.messages(scope, conversationId), history: timeline },
  ];
  if (threadId)
    history.unshift(
      {
        queryKey: messagingKeys.messages(scope, conversationId, threadId),
        history: { conversationId, threadId },
      },
      { queryKey: messagingKeys.threadRoot(scope, conversationId, threadId) },
    );
  return [
    { queryKey: messagingKeys.unread(scope) },
    ...history,
    { queryKey: targets },
    relatedMessages(scope),
    searchTarget(scope, { messagesOnly: true }),
  ];
}

function taskTargets(scope: QueryScope, event: RealtimeChange): RealtimeTarget[] {
  const tasks = queryKeys.domain(scope, "tasks");
  const { projectId, taskIds } = event;
  const records: RealtimeTarget[] = projectId
    ? [
        { queryKey: [...tasks, "list"] },
        { queryKey: queryKeys.detail(scope, "tasks", projectId) },
        ...(taskIds ?? []).map((id) => ({ queryKey: queryKeys.detail(scope, "tasks", id) })),
      ]
    : [{ queryKey: tasks }];
  return [
    ...records,
    { queryKey: queryKeys.domain(scope, "crm") },
    { queryKey: [...messagingKeys.all(scope), "context"] },
    { queryKey: [...messagingKeys.all(scope), "conversations"] },
    searchTarget(scope),
  ];
}

function contextTargets(scope: QueryScope, event: RealtimeChange): RealtimeTarget[] {
  const all = messagingKeys.all(scope);
  const { conversationId, messageId } = event;
  if (conversationId && messageId)
    return [
      {
        queryKey: [...all, "context", conversationId],
        // SAFETY: context keys end with their page's message IDs.
        predicate: (query) => (query.queryKey.at(-1) as string[]).includes(messageId),
      },
      { queryKey: [...all, "target", conversationId] },
      searchTarget(scope),
    ];
  return [
    { queryKey: [...all, "context"] },
    { queryKey: [...all, "target"] },
    ...["crm", "contacts", "interactions"].map((domain) => ({
      queryKey: queryKeys.domain(scope, domain),
    })),
    relatedMessages(scope),
    searchTarget(scope),
  ];
}

export function realtimeTargets(
  event: RealtimeChange,
  userId: string,
  organizationId: string | null,
): RealtimeTarget[] {
  const account = queryKeys.account(userId);
  const scope = organizationId ? { userId, organizationId } : undefined;
  switch (event.domain) {
    case "apps":
      return scope
        ? [{ queryKey: queryKeys.domain(scope, "apps") }, { queryKey: messagingKeys.apps(scope) }]
        : [];
    case "agents":
    case "agent-work":
      return [{ queryKey: [...account, "agents"] }];
    case "organization":
      return [
        { queryKey: [...account, "organizations"] },
        { queryKey: [...account, "user-invitations"] },
        ...(scope
          ? [{ queryKey: queryKeys.domain(scope, "apps") }, { queryKey: messagingKeys.apps(scope) }]
          : []),
      ];
    case "profile":
      return scope
        ? ["messaging", "people", "tasks", "crm"].map((domain) => ({
            queryKey: queryKeys.domain(scope, domain),
          }))
        : [];
    case "messaging":
      return scope ? messagingTargets(scope, event) : [];
    case "tasks":
      return scope ? taskTargets(scope, event) : [];
    case "context":
      return scope ? contextTargets(scope, event) : [];
    case "notifications":
    case "notification-preferences":
    case "session":
    case "access":
      return [];
  }
}
