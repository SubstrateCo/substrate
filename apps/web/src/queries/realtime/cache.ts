import { realtimeEvent, type RealtimeEvent } from "@substrate/contracts/realtime";

import {
  CancelledError,
  matchQuery,
  partialMatchKey,
  type Query,
  type QueryClient,
  type QueryFilters,
  type QueryKey,
} from "@tanstack/react-query";

import { isHarnessKey, queryKeys, userKeyOrganization } from "../keys";
import {
  domainTargets,
  markStaleAfterInflight,
  queryTargetFilter,
  type QueryTarget,
} from "../targets";
import { isAccessFailure } from "@/components/feedback/request-failure";

interface RealtimeQueryTarget extends QueryTarget {
  // Skips harness reads that have not failed. See keepsHarnessRead.
  exceptHarness?: true;
}

// Harness reads go through the desktop bridge, which verifies the session with the server first.
// They do not depend on missed hints, so a full refresh keeps loaded and loading ones. Failed ones
// still retry.
function keepsHarnessRead(query: Query, userId: string) {
  return isHarnessKey(query.queryKey, userId) && query.state.status !== "error";
}

const everything: RealtimeQueryTarget = { queryKey: [], exceptHarness: true };

/** How the cache matches the live state: refreshing after a ready, current, or stale after a failure. */
export type RealtimeHealth = "syncing" | "fresh" | "stale";

export const realtimeReconcileMs = 30_000;

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
      // Dataless hints refresh owner work or the caller's own call statuses. Server reads
      // enforce that distinction; both are private, user- and workspace-scoped keys.
      targets.push({ queryKey: queryKeys.agentWork(userId, organizationId ?? undefined) });
      break;
    case "organization":
      // Organization details and invitations changed. Membership and role changes send "access".
      targets.push({ queryKey: queryKeys.organizations }, { queryKey: queryKeys.userInvitations });
      // The detail key also covers the frame's summary, which holds the viewer's role.
      if (organizationId)
        targets.push(
          { queryKey: queryKeys.organizationDetail(organizationId) },
          { queryKey: queryKeys.invitations(organizationId) },
        );
      break;
    case "access":
      targets.push({ queryKey: queryKeys.sharingInvitations });
      targets.push({ queryKey: queryKeys.organizations }, { queryKey: queryKeys.userInvitations });
      if (organizationId) targets.push({ queryKey: queryKeys.organization(organizationId) });
      break;
    case "messaging":
      if (!organizationId) break;
      // A published reply can answer a call without changing the invocation itself.
      if (event.scope !== "read" && event.scope !== "reactions")
        targets.push({
          queryKey: queryKeys.myAgentCalls(userId, organizationId, event.conversationId),
        });
      targets.push(
        ...domainTargets(event.domain, organizationId, event.conversationId, event.scope, event),
      );
      break;
    case "tasks":
    case "context":
    case "notifications":
      if (organizationId)
        targets.push(
          ...domainTargets(event.domain, organizationId, event.conversationId, event.scope, event),
        );
      break;
  }
  return targets;
}

export function createRealtimeCache({
  queryClient,
  organizationId,
  userId,
  revalidate,
  onHealth,
  batchMs = 50,
}: {
  queryClient: QueryClient;
  organizationId: string | null;
  userId: string;
  revalidate: (refreshSession?: boolean) => Promise<void>;
  /** Reports each ready refresh, and every failed refresh. */
  onHealth?: (health: RealtimeHealth) => void;
  /** How long change hints collect before one refresh. */
  batchMs?: number;
}) {
  const targetFilter = (target: RealtimeQueryTarget, predicate: (query: Query) => boolean) => {
    const { exceptHarness, ...rest } = target;
    return queryTargetFilter(
      rest,
      (query) => (!exceptHarness || !keepsHarnessRead(query, userId)) && predicate(query),
    );
  };
  const seen = new Set<string>();
  // The first ready loads the cache. A later one follows a reconnect, which may hide a missed
  // revocation, so it resyncs. Only the latest ready reports that the cache is fresh.
  let readyCount = 0;
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
  let reconcileWork: Promise<void> | undefined;
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
      organizationId !== null &&
      (partialMatchKey(query.queryKey, queryKeys.organization(organizationId)) ||
        userKeyOrganization(query.queryKey, userId) === organizationId),
  };
  function resetPrivate(filter: QueryFilters) {
    const queries = queryClient.getQueryCache().findAll(filter);
    const placeholders = organizationId
      ? [queryKeys.conversationMessages(organizationId), queryKeys.messagePages(organizationId)]
      : [];
    // History and message context placeholders can hold a previous page outside the cache.
    // Replace their visible value before resetting, so access checks never display that old page.
    for (const query of queries) {
      if (placeholders.some((prefix) => partialMatchKey(query.queryKey, prefix)))
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
        partialMatchKey(query.queryKey, queryKeys.user(userId)) ||
        partialMatchKey(query.queryKey, queryKeys.session),
    });
    if (isDisposed()) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations }),
      queryClient.invalidateQueries({ queryKey: queryKeys.userInvitations }),
    ]);
    if (!isDisposed()) await revalidate(true);
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
      if (isCurrent(epoch)) await revalidate(true);
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
      let marked: boolean;
      try {
        marked = await markStaleAfterInflight(
          queryClient,
          query,
          promise,
          () => isCurrent(epoch) && !fetchedSince(query),
        );
      } catch (error) {
        // A resized or replaced page can abandon its request during a healthy resync.
        if (error instanceof CancelledError && isCurrent(epoch) && query.getObserversCount() === 0)
          return;
        throw error;
      }
      const readAgain = marked && refetch && !query.isDisabled();
      if (!readAgain || !isCurrent(epoch)) return;
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
      if (isCurrent(epoch) && route) await revalidate(true);
    } finally {
      flushing = false;
      if (pending.size) schedule();
    }
  }
  function schedule() {
    if (disposed || flushing || timer !== undefined) return;
    timer = setTimeout(() => {
      void flush().catch(() => {});
    }, batchMs);
  }
  function ready() {
    const count = ++readyCount;
    onHealth?.("syncing");
    const work = count === 1 ? initialRefresh() : resync();
    return work.then(
      () => {
        if (!disposed && count === readyCount) onHealth?.("fresh");
      },
      (error: Error) => {
        if (!disposed) onHealth?.("stale");
        throw error;
      },
    );
  }
  async function initialRefresh() {
    const epoch = generation;
    await refresh([everything]);
    if (isCurrent(epoch)) await revalidate();
  }
  function resync() {
    if (disposed) return Promise.resolve();
    // Reconnect may follow a missed revocation. Drop old private values first. Queries that the
    // reset already read after the reconnect are current, so the final refresh skips them.
    const since = ++clock;
    resyncWork ??= resetAccess()
      .then(() => (isDisposed() ? undefined : refresh([everything], since)))
      .finally(() => {
        resyncWork = undefined;
      });
    return resyncWork;
  }
  function reconcile() {
    if (disposed) return Promise.resolve();
    const failedReads = () =>
      queryClient.getQueryCache().findAll({
        predicate: (query) =>
          query.getObserversCount() > 0 &&
          !keepsHarnessRead(query, userId) &&
          query.state.status === "error",
      });
    const discardInactive = () => {
      // A missed removal may leave no mounted query that would fail its access check. Do not
      // retain idle private snapshots that could be shown before the next authorized read.
      for (const query of queryClient.getQueryCache().findAll(privateFilter)) {
        if (query.getObserversCount() !== 0 || query.state.fetchStatus !== "idle") continue;
        query.reset();
        queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
      }
    };
    discardInactive();
    // Pub/sub hints are best-effort. Re-read mounted data without clearing healthy views, even
    // when the socket stayed connected while the publisher missed a committed write.
    reconcileWork ??= refresh([everything])
      .then(async () => {
        if (disposed) return;
        const failed = failedReads();
        if (failed.some((query) => isAccessFailure(query.state.error))) await resetAccess();
        else await revalidate();
        if (!isDisposed()) onHealth?.(failed.length ? "stale" : "fresh");
      })
      .catch(async (error: Error) => {
        if (!isDisposed()) {
          // A pre-existing request can reject out of refresh() before its normal result scan.
          if (failedReads().some((query) => isAccessFailure(query.state.error)))
            await resetAccess();
          if (!isDisposed()) onHealth?.("stale");
        }
        throw error;
      })
      .finally(() => {
        if (!isDisposed()) discardInactive();
        reconcileWork = undefined;
      });
    return reconcileWork;
  }
  return {
    forbidden: revoke,
    resync,
    reconcile,
    async receive(value: RealtimeEvent) {
      const parsed = realtimeEvent.safeParse(value);
      if (isDisposed() || !parsed.success) return;
      const event = parsed.data;
      if (event.type === "ready") return ready();
      if (event.organizationId !== organizationId || seen.has(event.id)) return;
      seen.add(event.id);
      if (seen.size > 1000) seen.delete(seen.values().next().value!);
      if (event.domain === "access" && organizationId) {
        return resetAccess().catch((error: Error) => {
          if (!disposed) onHealth?.("stale");
          throw error;
        });
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
