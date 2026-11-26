import { realtimeEvent, type RealtimeEvent } from "@substrate/contracts/realtime";

import {
  CancelledError,
  hashKey,
  matchQuery,
  partialMatchKey,
  type Query,
  type QueryClient,
  type QueryFilters,
  type QueryKey,
} from "@tanstack/react-query";

import { isHarnessKey, queryKeys, userKeyOrganization } from "../keys";
import {
  appendNewMessages,
  canAppendNewMessages,
  refreshReplyCount,
  replyCountUpdate,
  type MessageLocation,
} from "../messaging/new-messages";
import {
  domainTargets,
  markStaleAfterInflight,
  queryTargetFilter,
  type QueryTarget,
} from "../targets";
import { isAccessFailure } from "@/api/access-failure";
import { loadMessageTarget } from "@/api/context/message-targets";
import { listMessages } from "@/api/messaging/requests";

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

export function realtimeQueryTargets(
  event: Extract<RealtimeEvent, { type: "change" }>,
  userId: string,
) {
  const organizationId = event.organizationId;
  const targets: RealtimeQueryTarget[] = [];
  switch (event.domain) {
    case "apps":
      if (organizationId)
        targets.push({ queryKey: queryKeys.organizationApps(organizationId, userId) });
      break;
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
          { queryKey: queryKeys.organizationApps(organizationId) },
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

/** The timeline or thread that a new message joins, when its hint names one. */
function newMessageLocation(
  event: Extract<RealtimeEvent, { type: "change" }>,
): MessageLocation | undefined {
  const { organizationId, conversationId, messageId, threadId } = event;
  const newMessage = event.domain === "messaging" && event.scope === "messages";
  const named = !!messageId && threadId !== undefined && !!conversationId;
  if (!newMessage || !named || !organizationId) return undefined;
  return { organizationId, conversationId, threadId: threadId ?? undefined };
}

export function createRealtimeCache({
  queryClient,
  organizationId,
  userId,
  revalidate,
  onHealth,
  batchMs = 50,
  loadMessages = listMessages,
  loadTarget = loadMessageTarget,
}: {
  queryClient: QueryClient;
  organizationId: string | null;
  userId: string;
  revalidate: (refreshSession?: boolean) => Promise<void>;
  /** Reports each ready refresh, and every failed refresh. */
  onHealth?: (health: RealtimeHealth) => void;
  /** How long change hints collect before one refresh. */
  batchMs?: number;
  /** Reads the messages that a new-message hint adds to a loaded page. */
  loadMessages?: typeof listMessages;
  /** Reads a thread's root alone, for its reply count. */
  loadTarget?: typeof loadMessageTarget;
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
  const privateFilter = {
    predicate: (query: { queryKey: QueryKey }) =>
      organizationId !== null &&
      (partialMatchKey(query.queryKey, queryKeys.organization(organizationId)) ||
        userKeyOrganization(query.queryKey, userId) === organizationId),
  };
  const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    if (event.action.type === "fetch") fetchStarts.set(event.query, ++clock);
    // A read that the server denies hides what the query showed before. Views keep their data
    // while access is checked again, so this is what removes revoked content from the screen.
    const { query, action } = event;
    const denied = action.type === "error" && isAccessFailure(action.error);
    if (denied && query.state.data !== undefined && privateFilter.predicate(query))
      query.setState({ ...query.state, data: undefined, dataUpdatedAt: 0 });
  });
  // Checks access again without clearing the screen. Unmounted values go; mounted ones are read
  // again, and a denied read clears its value. Placeholders keep the previous page until then.
  function recheckPrivate(filter: QueryFilters) {
    for (const query of queryClient.getQueryCache().findAll(filter)) {
      if (query.getObserversCount() === 0)
        queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
      // A disabled query is not read again, so nothing would check its value.
      else if (query.isDisabled()) query.reset();
    }
    // Cancels reads in flight: they may have started before the access change.
    return queryClient.invalidateQueries(filter);
  }
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
    // Every access event rechecks and cancels immediately, including events during an older reset.
    const reset = recheckPrivate(privateFilter);
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
    const refreshing = refresh([everything]);
    // refresh invalidates synchronously. Start the idle route session alongside mounted reads,
    // but still wait for refresh's follow-up reads when a request predates ready.
    const session = queryClient.getQueryCache().find({ queryKey: queryKeys.session, exact: true });
    const sessionRead = session
      ? queryClient.query({ ...session.options, queryKey: session.queryKey, staleTime: Infinity })
      : Promise.resolve();
    await Promise.all([refreshing, sessionRead]);
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
    // Pub/sub hints are best-effort. Re-read mounted data without clearing healthy views, even
    // when the socket stayed connected while the publisher missed a committed write. Unmounted
    // data stays cached but becomes stale: a view that mounts it shows it and reads it again, and
    // a denied read clears it.
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
      let targets = realtimeQueryTargets(event, userId);
      const at = ++clock;
      const epoch = generation;
      const location = newMessageLocation(event);
      // Takes one history's target out of the batch. A narrower read may replace it; when that
      // read cannot bring the pages up to date, the target goes back to the batch.
      const narrow = (
        threadId: string | undefined,
        read?: (shouldApply: () => boolean) => Promise<boolean>,
      ) => {
        const { organizationId: org, conversationId } = location!;
        const history = hashKey(queryKeys.messages(org, conversationId, threadId));
        const taken = targets.filter((target) => hashKey(target.queryKey) === history);
        targets = targets.filter((target) => !taken.includes(target));
        void read?.(() => isCurrent(epoch)).then((current) => {
          if (current || !isCurrent(epoch)) return;
          for (const target of taken) pending.set(JSON.stringify(target), target);
          pendingSince = Math.max(pendingSince ?? 0, at);
          schedule();
        });
      };
      // A new message changes only the latest page of its timeline or thread: older windows end
      // before it. Read just the messages after the loaded ones instead of the whole page.
      if (location && canAppendNewMessages(queryClient, location))
        narrow(location.threadId, (shouldApply) =>
          appendNewMessages(queryClient, location, {
            messageId: event.messageId,
            load: loadMessages,
            shouldApply,
          }),
        );
      // A reply changes the timeline only in its root's reply count: read the root alone, or
      // nothing when no loaded page shows it.
      const replyUpdate = location?.threadId && replyCountUpdate(queryClient, location);
      if (replyUpdate === "none") narrow(undefined);
      if (replyUpdate === "root")
        narrow(undefined, (shouldApply) =>
          refreshReplyCount(queryClient, location!, { load: loadTarget, shouldApply }),
        );
      for (const target of targets) pending.set(JSON.stringify(target), target);
      // The latest event bounds the batch: only fetches started after every event may skip it.
      pendingSince = at;
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
