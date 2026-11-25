import type { RealtimeEvent } from "@substrate/contracts/realtime";

import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";

import { queryKeys } from "./keys";
import type { MessagePageContext } from "@/api/context/links";

/** Queries that one change can make stale. */
export interface QueryTarget {
  queryKey: QueryKey;
  exact?: boolean;
  // Marks queries stale without reading them again.
  refetchType?: "none";
  // Matches only message context pages that show work links, or have not loaded yet.
  withLinks?: true;
  // Matches only message context pages whose key includes this message.
  withMessage?: string;
  // Matches only related lists that show a message of this conversation, or have not loaded yet.
  inConversation?: string;
  // Matches only queries whose key includes this record ID after queryKey.
  withId?: string;
  // Matches only message context pages that link one of these tasks or projects, or have not
  // loaded yet.
  linksTo?: string[];
  // Matches conversation lists that include a discussion of this work, or have not loaded yet.
  discussesWork?: { projectId: string; taskIds?: string[] };
  // Matches only searches whose results can include messages, threads, or conversations.
  searchesMessages?: true;
}

type Change = Extract<RealtimeEvent, { type: "change" }>;

/** The record domains whose changes refresh only one organization's queries. */
export type RecordDomain = Extract<
  Change["domain"],
  "messaging" | "tasks" | "context" | "notifications"
>;

function showsLinks(query: Query) {
  // SAFETY: withLinks targets only match message context pages, which cache this shape.
  const pages = query.state.data as MessagePageContext[] | undefined;
  return pages === undefined || pages.some((page) => page.links.length > 0);
}

/** Build the membership lookup once for all cached queries. Single-record writes need no Set. */
export function entityIdMatcher(ids: readonly string[]): (id: string) => boolean {
  if (ids.length === 1) {
    const [only] = ids;
    return (id) => id === only;
  }
  const set = new Set(ids);
  return (id) => set.has(id);
}

function linksWork(query: Query, matchesId: (id: string) => boolean) {
  // SAFETY: linksTo targets only match message context pages, which cache this shape.
  const pages = query.state.data as MessagePageContext[] | undefined;
  return (
    pages === undefined ||
    pages.some((page) =>
      page.links.some(
        (link) =>
          matchesId(link.entityId) || (!!link.projectEntityId && matchesId(link.projectEntityId)),
      ),
    )
  );
}

function showsConversation(query: Query, conversationId: string) {
  // SAFETY: inConversation targets only match related lists, which cache these rows.
  const rows = query.state.data as { conversationId: string }[] | undefined;
  return rows === undefined || rows.some((row) => row.conversationId === conversationId);
}

function discussesWork(
  query: Query,
  projectId: string,
  matchesTask: ((id: string) => boolean) | undefined,
) {
  if (!Array.isArray(query.state.data)) return query.state.data === undefined;
  // SAFETY: conversation lists have task metadata; other lists under this prefix omit task.
  const rows = query.state.data as {
    task?: { taskEntityId: string; projectEntityId: string } | null;
  }[];
  return rows.some(
    ({ task }) =>
      task && (matchesTask ? matchesTask(task.taskEntityId) : task.projectEntityId === projectId),
  );
}

// A search without kinds searches "all", which includes messages.
const messageSearchKinds = new Set(["all", "message", "thread", "conversation"]);

function searchesMessages(query: Query, prefixLength: number) {
  // SAFETY: searchesMessages targets only match search keys, which end with their input.
  const input = query.queryKey[prefixLength] as
    | { kind?: string; kinds?: readonly string[] }
    | undefined;
  if (typeof input !== "object" || input === null) return true;
  return (input.kinds ?? [input.kind ?? "all"]).some((kind) => messageSearchKinds.has(kind));
}

export function queryTargetFilter(
  target: QueryTarget,
  predicate: (query: Query) => boolean = () => true,
) {
  const {
    withLinks,
    withMessage,
    inConversation,
    withId,
    linksTo,
    discussesWork: work,
    searchesMessages: messagesOnly,
    ...filter
  } = target;
  const matchesLink = linksTo && entityIdMatcher(linksTo);
  const matchesTask = work?.taskIds && entityIdMatcher(work.taskIds);
  return {
    ...filter,
    predicate: (query: Query) =>
      (!withLinks || showsLinks(query)) &&
      (!withMessage || queryKeys.messagePageIds(query.queryKey).includes(withMessage)) &&
      (!inConversation || showsConversation(query, inConversation)) &&
      (!withId || query.queryKey.slice(filter.queryKey.length).includes(withId)) &&
      (!matchesLink || linksWork(query, matchesLink)) &&
      (!work || discussesWork(query, work.projectId, matchesTask)) &&
      (!messagesOnly || searchesMessages(query, filter.queryKey.length)) &&
      predicate(query),
  };
}

/** Identifiers of the changed records. Without one, targets cover every record it could name. */
export type ChangeDetail = Partial<
  Pick<Change, "messageId" | "threadId" | "projectId" | "taskIds">
>;

// The history pages that show a changed message. A new reply also changes its root's reply count
// in the main timeline. An edited or deleted root can be open as a thread's header.
function historyTargets(
  organizationId: string,
  conversationId: string | undefined,
  scope: Change["scope"],
  { messageId, threadId }: ChangeDetail,
): QueryTarget[] {
  if (!conversationId || threadId === undefined || (scope !== "messages" && !messageId))
    return [{ queryKey: queryKeys.conversationMessages(organizationId, conversationId) }];
  const timeline = { queryKey: queryKeys.messages(organizationId, conversationId) };
  if (threadId === null)
    return scope !== "messages" && messageId
      ? [timeline, { queryKey: queryKeys.messages(organizationId, conversationId, messageId) }]
      : [timeline];
  const thread = { queryKey: queryKeys.messages(organizationId, conversationId, threadId) };
  return scope === "messages" ? [thread, timeline] : [thread];
}

// A reaction changes one message's reactions, shown in its history page, its reaction details,
// and target views of that conversation. Unread counts, order, and search stay the same.
function reactionTargets(
  organizationId: string,
  conversationId: string,
  { messageId, threadId }: ChangeDetail,
): QueryTarget[] {
  return [
    {
      queryKey:
        threadId === undefined
          ? queryKeys.conversationMessages(organizationId, conversationId)
          : queryKeys.messages(organizationId, conversationId, threadId ?? undefined),
    },
    {
      queryKey: messageId
        ? queryKeys.messageReactions(organizationId, conversationId, messageId)
        : queryKeys.conversationReactions(organizationId, conversationId),
    },
    { queryKey: queryKeys.messageTargets(organizationId, conversationId) },
  ];
}

// A change to one project's tasks. Only that project's readers receive it.
function workTargets(
  organizationId: string,
  projectId: string,
  taskIds: string[] | undefined,
): QueryTarget[] {
  const shared: QueryTarget[] = [
    { queryKey: queryKeys.homeTasks(organizationId) },
    { queryKey: queryKeys.crm(organizationId) },
    // Task discussions show their task's current title and project backlink.
    { queryKey: queryKeys.conversations(organizationId), discussesWork: { projectId, taskIds } },
    ...searchTargets(organizationId),
  ];
  // The project itself changed, or tasks were deleted: refresh what shows the project or any of
  // its tasks. Projects lists show project details; locations name their project.
  if (!taskIds)
    return [
      { queryKey: queryKeys.projects(organizationId) },
      { queryKey: queryKeys.tasks(organizationId), withId: projectId },
      { queryKey: [...queryKeys.tasks(organizationId), "location"] },
      { queryKey: queryKeys.related(organizationId, projectId) },
      { queryKey: queryKeys.activity(organizationId, projectId) },
      { queryKey: queryKeys.messagePages(organizationId), linksTo: [projectId] },
      { queryKey: queryKeys.notifications(organizationId) },
      ...shared,
    ];
  // Task changes leave related messages and the projects list alone. Notifications show task
  // titles, but their read state does not change.
  return [
    { queryKey: queryKeys.project(organizationId, projectId) },
    ...taskIds.flatMap((taskId) => [
      { queryKey: queryKeys.taskLocation(organizationId, taskId) },
      { queryKey: queryKeys.taskAttachments(organizationId, projectId, taskId) },
      { queryKey: queryKeys.activity(organizationId, taskId) },
    ]),
    { queryKey: queryKeys.messagePages(organizationId), linksTo: taskIds },
    { queryKey: queryKeys.notificationGroups(organizationId, "all") },
    { queryKey: queryKeys.notificationGroups(organizationId, "unread") },
    { queryKey: queryKeys.notificationPreview(organizationId) },
    { queryKey: queryKeys.notificationEvents(organizationId) },
    ...shared,
  ];
}

// Messages that reference one project's work changed. Related lists and source-message activity
// of those tasks change; a project-wide change can reach any list.
function referencedWorkTargets(
  organizationId: string,
  { projectId, taskIds }: ChangeDetail,
): QueryTarget[] {
  if (!projectId || !taskIds)
    return [
      { queryKey: queryKeys.related(organizationId) },
      { queryKey: queryKeys.activity(organizationId) },
      ...searchTargets(organizationId),
    ];
  return [
    { queryKey: queryKeys.related(organizationId, projectId) },
    ...taskIds.flatMap((taskId) => [
      { queryKey: queryKeys.related(organizationId, taskId) },
      { queryKey: queryKeys.activity(organizationId, taskId) },
    ]),
    ...searchTargets(organizationId),
  ];
}

// A changed message's context shows only in pages that include it.
function messagePagesTarget(
  organizationId: string,
  conversationId: string | undefined,
  messageId: string | undefined,
): QueryTarget {
  const target: QueryTarget = { queryKey: queryKeys.messagePages(organizationId, conversationId) };
  if (conversationId && messageId) target.withMessage = messageId;
  return target;
}

// Searches only become stale, so a change does not start a burst of search requests.
export function searchTargets(organizationId: string): QueryTarget[] {
  return queryKeys.searches(organizationId).map((queryKey) => ({
    queryKey,
    refetchType: "none",
  }));
}

/**
 * What a change to one organization's records makes stale. Realtime hints and local writes of
 * the same records use these targets, so both refresh the same queries.
 */
export function domainTargets(
  domain: RecordDomain,
  organizationId: string,
  conversationId?: string,
  scope?: Change["scope"],
  detail: ChangeDetail = {},
): QueryTarget[] {
  switch (domain) {
    case "messaging":
      // A read position changes only the reader's unread counts.
      if (scope === "read") return [{ queryKey: queryKeys.messageUnread(organizationId) }];
      if (scope === "reactions" && conversationId)
        return reactionTargets(organizationId, conversationId, detail);
      return [
        { queryKey: queryKeys.messageUnread(organizationId) },
        // Message content changes leave membership and conversation details unchanged.
        ...(scope !== "messages" ? [{ queryKey: queryKeys.conversations(organizationId) }] : []),
        ...historyTargets(organizationId, conversationId, scope, detail),
        // A new message has no reactions yet. Deleting one removes only its own reactions.
        ...(scope !== "messages"
          ? [
              {
                queryKey:
                  conversationId && detail.messageId
                    ? queryKeys.messageReactions(organizationId, conversationId, detail.messageId)
                    : queryKeys.conversationReactions(organizationId, conversationId),
              },
            ]
          : []),
        // Related lists show messages with their reply counts. A message change reaches only lists
        // that show its conversation; membership changes can reveal messages they do not show yet.
        conversationId && (scope === "messages" || detail.messageId)
          ? { queryKey: queryKeys.related(organizationId), inConversation: conversationId }
          : { queryKey: queryKeys.related(organizationId) },
        // A new message cannot change the context of loaded messages. A new message gets its own
        // page key; its reference changes arrive as "context" hints.
        ...(scope !== "messages"
          ? [messagePagesTarget(organizationId, conversationId, detail.messageId)]
          : []),
        { queryKey: queryKeys.messageTargets(organizationId, conversationId) },
        // New posts need not interrupt an open search, and cannot change people, agents, or
        // records. General changes include edits and deletions, so their old excerpts must be
        // replaced in open results as well.
        ...searchTargets(organizationId).map((target) =>
          scope === "messages"
            ? { ...target, searchesMessages: true as const }
            : { queryKey: target.queryKey },
        ),
      ];
    case "tasks":
      if (detail.projectId) return workTargets(organizationId, detail.projectId, detail.taskIds);
      // Without IDs, such as a grant change: any task record can change.
      return [
        { queryKey: queryKeys.crm(organizationId) },
        { queryKey: queryKeys.tasks(organizationId) },
        { queryKey: queryKeys.activity(organizationId) },
        { queryKey: queryKeys.related(organizationId) },
        // Pages without work links show no task titles.
        { queryKey: queryKeys.messagePages(organizationId), withLinks: true },
        // Notifications show task titles. New notifications arrive as their own hints.
        { queryKey: queryKeys.notifications(organizationId) },
        ...searchTargets(organizationId),
      ];
    case "context":
      // Reference changes do not change notifications. Writes that create notifications, and
      // conversation deletion, send notifications hints to the recipients.
      if (conversationId && detail.messageId)
        // One message's references changed: its context pages and the conversation's targets.
        return [
          messagePagesTarget(organizationId, conversationId, detail.messageId),
          { queryKey: queryKeys.messageTargets(organizationId, conversationId) },
          ...searchTargets(organizationId),
        ];
      if (detail.projectId) return referencedWorkTargets(organizationId, detail);
      // Without IDs, such as a conversation deletion or a calendar sync: any reference can change.
      return [
        { queryKey: queryKeys.calendar(organizationId) },
        { queryKey: queryKeys.contacts(organizationId) },
        { queryKey: queryKeys.contactInteractions(organizationId) },
        { queryKey: queryKeys.crm(organizationId) },
        { queryKey: queryKeys.activity(organizationId) },
        { queryKey: queryKeys.related(organizationId) },
        { queryKey: queryKeys.messagePages(organizationId) },
        { queryKey: queryKeys.messageTargets(organizationId) },
        ...searchTargets(organizationId),
      ];
    case "notifications":
      return [{ queryKey: queryKeys.notifications(organizationId) }];
  }
}

/**
 * Marks a query stale after the read it had in flight commits. That read's snapshot may predate
 * the change, and its success would otherwise erase the staleness. Skips the query when the
 * cache dropped it or `shouldMark` declines. Resolves whether it marked the query.
 */
export async function markStaleAfterInflight(
  client: QueryClient,
  query: Query,
  promise: Promise<unknown> | undefined,
  shouldMark: () => boolean = () => true,
) {
  await promise;
  if (client.getQueryCache().get(query.queryHash) !== query || !shouldMark()) return false;
  await client.invalidateQueries(
    { queryKey: query.queryKey, exact: true, refetchType: "none" },
    { cancelRefetch: false },
  );
  return true;
}

/** Invalidates local writes' targets. Stale-only targets stay stale after reads in flight. */
export function invalidateTargets(client: QueryClient, targets: QueryTarget[]) {
  // Combined domain targets can overlap. Read each query once; any refreshing target wins
  // over a stale-only target, regardless of their order.
  const matched = new Map<Query, boolean>();
  for (const target of targets)
    for (const query of client.getQueryCache().findAll(queryTargetFilter(target)))
      matched.set(query, matched.get(query) === true || target.refetchType !== "none");
  for (const [query, refetch] of matched)
    if (!refetch && query.state.fetchStatus !== "idle")
      void markStaleAfterInflight(client, query, query.promise).catch(() => {});
  return Promise.all([
    client.invalidateQueries({ predicate: (query) => matched.get(query) === true }),
    client.invalidateQueries({
      predicate: (query) => matched.get(query) === false,
      refetchType: "none",
    }),
  ]);
}
