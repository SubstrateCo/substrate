import type { RealtimeEvent } from "@substrate/contracts/realtime";

import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";

import type { SearchInput } from "./context/search";
import { queryKeys } from "./keys";
import type { MessagePageContext } from "@/api/context/links";

export interface QueryTarget {
  queryKey: QueryKey;
  exact?: boolean;
  refetchType?: "none";
  withLinks?: true;
  withMessage?: string;
  inConversation?: string;
  withId?: string;
  linksTo?: string[];
  discussesWork?: { projectId: string; taskIds?: string[] };
  searchesMessages?: true;
}

type Change = Extract<RealtimeEvent, { type: "change" }>;

export type RecordDomain = Extract<
  Change["domain"],
  "messaging" | "tasks" | "context" | "notifications"
>;

function showsLinks(query: Query) {
  // SAFETY: withLinks targets only match message context pages, which cache this shape.
  const pages = query.state.data as MessagePageContext[] | undefined;
  return pages === undefined || pages.some((page) => page.links.length > 0);
}

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

const messageSearchKinds = new Set<SearchInput["kind"]>([
  "all",
  "message",
  "thread",
  "conversation",
]);

function searchesMessages(query: Query, prefixLength: number) {
  // SAFETY: searchesMessages targets only match search keys, which end with their input.
  const input = query.queryKey[prefixLength] as Pick<SearchInput, "kind" | "kinds"> | undefined;
  return (input?.kinds ?? [input?.kind ?? "all"]).some((kind) => messageSearchKinds.has(kind));
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

export type ChangeDetail = Partial<
  Pick<Change, "messageId" | "threadId" | "projectId" | "taskIds">
>;

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

function workTargets(
  organizationId: string,
  projectId: string,
  taskIds: string[] | undefined,
): QueryTarget[] {
  const shared: QueryTarget[] = [
    { queryKey: queryKeys.crm(organizationId) },
    { queryKey: queryKeys.conversations(organizationId), discussesWork: { projectId, taskIds } },
    ...searchTargets(organizationId),
  ];
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
    { queryKey: queryKeys.notificationEvents(organizationId) },
    ...shared,
  ];
}

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

function messagePagesTarget(
  organizationId: string,
  conversationId: string | undefined,
  messageId: string | undefined,
): QueryTarget {
  const target: QueryTarget = { queryKey: queryKeys.messagePages(organizationId, conversationId) };
  if (conversationId && messageId) target.withMessage = messageId;
  return target;
}

export function searchTargets(organizationId: string): QueryTarget[] {
  return queryKeys.searches(organizationId).map((queryKey) => ({
    queryKey,
    refetchType: "none",
  }));
}

export function domainTargets(
  domain: RecordDomain,
  organizationId: string,
  conversationId?: string,
  scope?: Change["scope"],
  detail: ChangeDetail = {},
): QueryTarget[] {
  switch (domain) {
    case "messaging":
      if (scope === "read") return [{ queryKey: queryKeys.messageUnread(organizationId) }];
      if (scope === "reactions" && conversationId)
        return reactionTargets(organizationId, conversationId, detail);
      return [
        { queryKey: queryKeys.messageUnread(organizationId) },
        ...(scope !== "messages" ? [{ queryKey: queryKeys.conversations(organizationId) }] : []),
        ...historyTargets(organizationId, conversationId, scope, detail),
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
        conversationId && (scope === "messages" || detail.messageId)
          ? { queryKey: queryKeys.related(organizationId), inConversation: conversationId }
          : { queryKey: queryKeys.related(organizationId) },
        ...(scope !== "messages"
          ? [messagePagesTarget(organizationId, conversationId, detail.messageId)]
          : []),
        { queryKey: queryKeys.messageTargets(organizationId, conversationId) },
        ...searchTargets(organizationId).map((target) =>
          scope === "messages"
            ? { ...target, searchesMessages: true as const }
            : { queryKey: target.queryKey },
        ),
      ];
    case "tasks":
      if (detail.projectId) return workTargets(organizationId, detail.projectId, detail.taskIds);
      return [
        { queryKey: queryKeys.crm(organizationId) },
        { queryKey: queryKeys.tasks(organizationId) },
        { queryKey: queryKeys.activity(organizationId) },
        { queryKey: queryKeys.related(organizationId) },
        { queryKey: queryKeys.messagePages(organizationId), withLinks: true },
        { queryKey: queryKeys.notifications(organizationId) },
        ...searchTargets(organizationId),
      ];
    case "context":
      if (conversationId && detail.messageId)
        return [
          messagePagesTarget(organizationId, conversationId, detail.messageId),
          { queryKey: queryKeys.messageTargets(organizationId, conversationId) },
          ...searchTargets(organizationId),
        ];
      if (detail.projectId) return referencedWorkTargets(organizationId, detail);
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

export function invalidateTargets(client: QueryClient, targets: QueryTarget[]) {
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
