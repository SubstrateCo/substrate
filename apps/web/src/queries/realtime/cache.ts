import { realtimeEvent, type RealtimeEvent } from "@startup-os/contracts/realtime";

import {
  CancelledError,
  matchQuery,
  type Query,
  type QueryClient,
  type QueryFilters,
  type QueryKey,
} from "@tanstack/react-query";

import { queryKeys } from "../keys";
import type { MessagePageContext } from "@/api/context/links";

interface RealtimeQueryTarget {
  queryKey: QueryKey;
  exact?: boolean;
  refetchType?: "none";
  // Matches only message context pages that show work links, or have not loaded yet.
  withLinks?: true;
}

function showsLinks(query: Query) {
  // SAFETY: withLinks targets only match message context pages, which cache this shape.
  const pages = query.state.data as MessagePageContext[] | undefined;
  return pages === undefined || pages.some((page) => page.links.length > 0);
}

function targetFilter(target: RealtimeQueryTarget, predicate: (query: Query) => boolean) {
  const { withLinks, ...filter } = target;
  return {
    ...filter,
    predicate: (query: Query) => (!withLinks || showsLinks(query)) && predicate(query),
  };
}

function searchTargets(organizationId: string): RealtimeQueryTarget[] {
  return ["search", "search-pages"].map((kind) => ({
    queryKey: [...queryKeys.context(organizationId), kind],
    refetchType: "none",
  }));
}

export function realtimeQueryTargets(
  event: Extract<RealtimeEvent, { type: "change" }>,
  userId: string,
) {
  const organizationId = event.organizationId;
  const targets: RealtimeQueryTarget[] = [];
  switch (event.domain) {
    case "session":
      targets.push({ queryKey: queryKeys.session });
      break;
    case "profile":
      targets.push({ queryKey: queryKeys.session });
      if (organizationId)
        targets.push(
          { queryKey: queryKeys.messaging(organizationId) },
          { queryKey: queryKeys.context(organizationId) },
          { queryKey: queryKeys.tasks(organizationId) },
        );
      break;
    case "agents":
      targets.push({ queryKey: queryKeys.agents(userId) });
      break;
    case "agent-work":
      // Hints are dataless and go only to the owner. They cover server requests and status, and
      // local work that another device changed by answering.
      targets.push({ queryKey: queryKeys.agentWork(userId, organizationId ?? undefined) });
      break;
    case "organization":
      // Organization details and invitations changed. Membership and role changes send "access".
      targets.push({ queryKey: queryKeys.organizations }, { queryKey: queryKeys.userInvitations });
      if (organizationId)
        targets.push(
          { queryKey: queryKeys.organizationDetail(organizationId) },
          { queryKey: queryKeys.invitations(organizationId) },
          { queryKey: queryKeys.activeMember(organizationId) },
        );
      break;
    case "access":
      targets.push({ queryKey: queryKeys.sharingInvitations });
      targets.push({ queryKey: queryKeys.organizations }, { queryKey: queryKeys.userInvitations });
      if (organizationId) targets.push({ queryKey: queryKeys.organization(organizationId) });
      break;
    case "messaging":
      if (organizationId) {
        // Message content changes leave membership and conversation details unchanged.
        if (event.scope !== "messages")
          targets.push({ queryKey: queryKeys.conversations(organizationId) });
        targets.push({
          queryKey: event.conversationId
            ? queryKeys.messages(organizationId, event.conversationId).slice(0, -1)
            : [...queryKeys.messaging(organizationId), "messages"],
        });
        targets.push({ queryKey: [...queryKeys.context(organizationId), "related"] });
        targets.push({
          queryKey: [
            ...queryKeys.context(organizationId),
            "message-pages",
            ...(event.conversationId ? [event.conversationId] : []),
          ],
        });
        targets.push({ queryKey: queryKeys.messageTargets(organizationId, event.conversationId) });
        targets.push(...searchTargets(organizationId));
      }
      break;
    case "tasks":
      if (organizationId)
        targets.push(
          { queryKey: queryKeys.tasks(organizationId) },
          { queryKey: [...queryKeys.context(organizationId), "activity"] },
          { queryKey: [...queryKeys.context(organizationId), "related"] },
          // Pages without work links show no task titles.
          { queryKey: [...queryKeys.context(organizationId), "message-pages"], withLinks: true },
          // Notifications show task titles. New notifications arrive as their own hints.
          { queryKey: [...queryKeys.context(organizationId), "notifications"] },
          ...searchTargets(organizationId),
        );
      break;
    case "context":
      // Reference changes do not change notifications. Writes that create notifications, and
      // conversation deletion, send notifications hints to the recipients.
      if (organizationId)
        targets.push(
          ...["activity", "related", "message-pages", "target"].map((kind) => ({
            queryKey: [...queryKeys.context(organizationId), kind],
          })),
          ...searchTargets(organizationId),
        );
      break;
    case "notifications":
      if (organizationId)
        targets.push({
          queryKey: [...queryKeys.context(organizationId), "notifications"],
        });
      break;
  }
  return targets;
}

export function createRealtimeCache({
  queryClient,
  organizationId,
  userId,
  revalidate,
}: {
  queryClient: QueryClient;
  organizationId: string | null;
  userId: string;
  revalidate: () => Promise<void>;
}) {
  const seen = new Set<string>();
  const pending = new Map<string, RealtimeQueryTarget>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;
  let disposed = false;
  let generation = 0;
  const isDisposed = () => disposed;
  const isCurrent = (epoch: number) => !disposed && epoch === generation;
  let routePending = false;
  let accessWork = Promise.resolve();
  let resyncWork: Promise<void> | undefined;
  // One counter orders fetch starts and event receipt. A fetch that starts after an event
  // arrived reads the committed change, so that event needs no second read for it.
  let clock = 0;
  let pendingSince: number | undefined;
  const fetchStarts = new WeakMap<Query, number>();
  const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "fetch")
      fetchStarts.set(event.query, ++clock);
  });
  const privateFilter = {
    predicate: (query: { queryKey: QueryKey }) =>
      (organizationId !== null &&
        query.queryKey[0] === "organizations" &&
        query.queryKey[1] === organizationId) ||
      (query.queryKey[0] === "users" &&
        query.queryKey[1] === userId &&
        query.queryKey[3] === organizationId),
  };
  function resetPrivate(filter: QueryFilters) {
    const queries = queryClient.getQueryCache().findAll(filter);
    const placeholders = organizationId
      ? [
          [...queryKeys.messaging(organizationId), "messages"],
          [...queryKeys.context(organizationId), "message-pages"],
        ]
      : [];
    // History and message context placeholders can hold a previous page outside the cache.
    // Replace their visible value before resetting, so access checks never display that old page.
    for (const query of queries) {
      if (
        placeholders.some((prefix) => prefix.every((part, index) => query.queryKey[index] === part))
      )
        queryClient.setQueryData(query.queryKey, []);
    }
    for (const query of queries) {
      if (query.getObserversCount() === 0) {
        query.reset();
        queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
      }
    }
    // Reset mounted queries in place: removal detaches their observers from later updates.
    return queryClient.resetQueries(filter);
  }
  async function revoke() {
    generation++;
    clearTimeout(timer);
    timer = undefined;
    pending.clear();
    await resetPrivate({
      predicate: (query) =>
        privateFilter.predicate(query) ||
        (query.queryKey[0] === "users" && query.queryKey[1] === userId) ||
        (query.queryKey[0] === queryKeys.session[0] && query.queryKey[1] === queryKeys.session[1]),
    });
    if (isDisposed()) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations }),
      queryClient.invalidateQueries({ queryKey: queryKeys.userInvitations }),
    ]);
    if (!isDisposed()) await revalidate();
  }
  function resetAccess() {
    const epoch = ++generation;
    // Every access event clears/cancels immediately, including events during an older reset.
    const reset = resetPrivate(privateFilter);
    async function finish() {
      await reset;
      if (!isCurrent(epoch)) return;
      await refresh([
        { queryKey: queryKeys.session },
        { queryKey: queryKeys.organizations },
        { queryKey: queryKeys.userInvitations },
        { queryKey: queryKeys.sharingInvitations },
      ]);
      if (isCurrent(epoch)) await revalidate();
    }
    // Superseded resets skip metadata work. The latest reset still completes after a slow route load.
    accessWork = accessWork.then(finish, finish);
    return accessWork;
  }
  async function refresh(targets: RealtimeQueryTarget[], since?: number) {
    const epoch = generation;
    const fetchedSince = (query: Query) =>
      since !== undefined && (fetchStarts.get(query) ?? 0) > since;
    const inflight = new Map(
      targets
        .flatMap((target) =>
          queryClient
            .getQueryCache()
            .findAll(
              targetFilter(
                target,
                (query) => query.state.fetchStatus !== "idle" && !fetchedSince(query),
              ),
            ),
        )
        .map((query) => [query.queryHash, query]),
    );
    const loads = [...inflight.values()].map((query) => ({
      query,
      refetch: targets.some(
        (target) =>
          target.refetchType !== "none" &&
          matchQuery(
            targetFilter(target, () => true),
            query,
          ),
      ),
      promise: query.promise,
    }));
    // Observers can share a request with imperative route loaders. Never cancel ordinary refreshes.
    const invalidations = targets.map((target) =>
      queryClient.invalidateQueries(
        targetFilter(target, (query) => !fetchedSince(query)),
        { cancelRefetch: false },
      ),
    );
    const deferred = loads.map(async ({ query, promise, refetch }) => {
      try {
        await promise;
      } catch (error) {
        // A resized or replaced page can abandon its request during a healthy resync.
        if (error instanceof CancelledError && isCurrent(epoch) && query.getObserversCount() === 0)
          return;
        throw error;
      }
      if (!isCurrent(epoch) || fetchedSince(query)) return;
      // Mark stale after the original snapshot commits, so its success cannot erase the event.
      await queryClient.invalidateQueries(
        { queryKey: query.queryKey, exact: true, refetchType: "none" },
        { cancelRefetch: false },
      );
      if (!isCurrent(epoch) || !refetch || query.isDisabled()) return;
      await queryClient.query({ ...query.options, queryKey: query.queryKey });
    });
    await Promise.all([...invalidations, ...deferred]);
  }
  async function flush() {
    timer = undefined;
    flushing = true;
    const targets = [...pending.values()];
    pending.clear();
    const route = routePending;
    routePending = false;
    const since = pendingSince;
    pendingSince = undefined;
    const epoch = generation;
    try {
      await refresh(targets, since);
      if (isCurrent(epoch) && route) await revalidate();
    } finally {
      flushing = false;
      if (pending.size) schedule();
    }
  }
  function schedule() {
    if (disposed || flushing || timer !== undefined) return;
    timer = setTimeout(() => {
      void flush().catch(() => {});
    }, 50);
  }
  return {
    forbidden: revoke,
    resync() {
      if (disposed) return Promise.resolve();
      // Reconnect may follow a missed revocation. Drop old private values first. Queries that the
      // reset already read after the reconnect are current, so the final refresh skips them.
      const since = ++clock;
      resyncWork ??= resetAccess()
        .then(() => (isDisposed() ? undefined : refresh([{ queryKey: [] }], since)))
        .finally(() => {
          resyncWork = undefined;
        });
      return resyncWork;
    },
    async receive(value: RealtimeEvent) {
      const parsed = realtimeEvent.safeParse(value);
      if (isDisposed() || !parsed.success) return;
      const event = parsed.data;
      if (event.type === "ready") {
        const epoch = generation;
        await refresh([{ queryKey: [] }]);
        if (isCurrent(epoch)) await revalidate();
        return;
      }
      if (event.organizationId !== organizationId || seen.has(event.id)) return;
      seen.add(event.id);
      if (seen.size > 1000) seen.delete(seen.values().next().value!);
      if (event.domain === "access" && organizationId) {
        return resetAccess();
      }
      if (isDisposed()) return;
      for (const target of realtimeQueryTargets(event, userId))
        pending.set(JSON.stringify(target), target);
      // The latest event bounds the batch: only fetches started after every event may skip it.
      pendingSince = ++clock;
      routePending ||=
        event.domain === "session" ||
        event.domain === "profile" ||
        event.domain === "organization" ||
        event.domain === "access";
      schedule();
    },
    dispose() {
      disposed = true;
      generation++;
      clearTimeout(timer);
      pending.clear();
      unsubscribeCache();
      void queryClient.cancelQueries(privateFilter);
      void queryClient.cancelQueries({ queryKey: queryKeys.session });
      void queryClient.cancelQueries({ queryKey: queryKeys.agents(userId) });
    },
  };
}
