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

export function queryTargetFilter(
  target: QueryTarget,
  predicate: (query: Query) => boolean = () => true,
) {
  const { withLinks, ...filter } = target;
  return {
    ...filter,
    predicate: (query: Query) => (!withLinks || showsLinks(query)) && predicate(query),
  };
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
): QueryTarget[] {
  switch (domain) {
    case "messaging":
      return [
        // Message content changes leave membership and conversation details unchanged.
        ...(scope !== "messages" ? [{ queryKey: queryKeys.conversations(organizationId) }] : []),
        { queryKey: queryKeys.conversationMessages(organizationId, conversationId) },
        { queryKey: queryKeys.conversationReactions(organizationId, conversationId) },
        { queryKey: queryKeys.related(organizationId) },
        // A new message or reaction cannot change the context of loaded messages. A new message
        // gets its own page key; its reference changes arrive as "context" hints.
        ...(scope !== "messages"
          ? [{ queryKey: queryKeys.messagePages(organizationId, conversationId) }]
          : []),
        { queryKey: queryKeys.messageTargets(organizationId, conversationId) },
        ...searchTargets(organizationId),
      ];
    case "tasks":
      return [
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
      return [
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
  return Promise.all(
    targets.map((target) => {
      const filter = queryTargetFilter(target);
      if (target.refetchType === "none")
        for (const query of client.getQueryCache().findAll(filter))
          if (query.state.fetchStatus !== "idle")
            void markStaleAfterInflight(client, query, query.promise).catch(() => {});
      return client.invalidateQueries(filter);
    }),
  );
}
