import type { RealtimeEvent } from "@substrate/contracts/realtime";

import type { Query, QueryKey } from "@tanstack/react-query";

import { queryKeys, type QueryScope } from "../keys";
import { messagingKeys } from "@/features/messaging/keys";
import type { MessagingConversationTarget } from "@/features/messaging/types";

export type RealtimeChange = Extract<RealtimeEvent, { type: "change" }>;

/** Queries that one change can make stale. */
export interface RealtimeTarget {
  queryKey: QueryKey;
  // Marks queries stale without reading them again.
  refetchType?: "none";
  predicate?: (query: Query) => boolean;
  // Marks the history of one timeline or thread, which a narrower read may bring up to date.
  history?: MessagingConversationTarget;
}

const includes = (part: string) => (query: Query) => query.queryKey.includes(part);

// Searches usually only become stale, so a change does not start a burst of search requests.
// Edits and deletions refresh them, so their old excerpts leave open results.
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

// Task and contact pages list the messages that link them, with their reply counts.
const relatedMessages = (scope: QueryScope): RealtimeTarget => ({
  queryKey: queryKeys.workspace(scope),
  predicate: includes("related-messages"),
});

function messagingTargets(scope: QueryScope, event: RealtimeChange): RealtimeTarget[] {
  const all = messagingKeys.all(scope);
  const { conversationId, messageId, threadId } = event;
  // A read position changes only the reader's unread counts.
  if (event.scope === "read") return [{ queryKey: messagingKeys.unread(scope) }];
  if (!conversationId)
    return [{ queryKey: all }, searchTarget(scope, { refetch: true }), relatedMessages(scope)];
  const histories = [...all, "messages", conversationId];
  const targets = [...all, "target", conversationId];
  // A reaction changes one message's reactions, in its history and its reaction details.
  if (event.scope === "reactions")
    return [
      { queryKey: histories },
      { queryKey: [...all, "thread-root", conversationId] },
      { queryKey: messageId ? [...all, "reactions", messageId] : [...all, "reactions"] },
      { queryKey: targets },
    ];
  // Edits, deletions, and membership changes can change any of the conversation's views.
  if (event.scope !== "messages" || threadId === undefined)
    return [{ queryKey: all }, searchTarget(scope, { refetch: true }), relatedMessages(scope)];
  // A new message has no reactions or references yet, and leaves conversation details alone.
  // A reply also changes its root's reply count in the timeline and the thread header.
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
  // Without IDs, such as a grant change: any task record can change.
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
    // Message context and task discussions show task titles.
    { queryKey: [...messagingKeys.all(scope), "context"] },
    { queryKey: [...messagingKeys.all(scope), "conversations"] },
    searchTarget(scope),
  ];
}

function contextTargets(scope: QueryScope, event: RealtimeChange): RealtimeTarget[] {
  const all = messagingKeys.all(scope);
  const { conversationId, messageId } = event;
  // One message's references changed: the context pages that include it.
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
  // Without IDs, such as a conversation deletion or a calendar sync: any reference can change.
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

/**
 * What a realtime change makes stale. Session and access changes also check the session again,
 * which the cache does itself.
 */
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
      // Membership and role changes send "access".
      return [
        { queryKey: [...account, "organizations"] },
        { queryKey: [...account, "user-invitations"] },
        ...(scope
          ? [{ queryKey: queryKeys.domain(scope, "apps") }, { queryKey: messagingKeys.apps(scope) }]
          : []),
      ];
    case "profile":
      // Names and pictures show beside messages, people, and work.
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
    // Mobile does not show meetings or notifications. Session and access changes recheck
    // everything.
    case "meetings":
    case "notifications":
    case "session":
    case "access":
      return [];
  }
}
