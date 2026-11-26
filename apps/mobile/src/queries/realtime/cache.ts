import type { Query, QueryClient, QueryFilters } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { realtimeTargets, type RealtimeChange, type RealtimeTarget } from "./targets";
import type { getMessageTarget } from "@/features/messaging/api/context";
import type { listMessages } from "@/features/messaging/api/messages";
import {
  appendNewMessages,
  canAppendNewMessages,
  refreshReplyCount,
  replyCountUpdate,
} from "@/features/messaging/queries/new-messages";
import type { MessagingConversationTarget } from "@/features/messaging/types";

function targetFilter({ queryKey, predicate }: RealtimeTarget): QueryFilters {
  return predicate ? { queryKey, predicate } : { queryKey };
}

/** Refreshes the queries that realtime changes make stale, and checks access again. */
export function createRealtimeCache({
  queryClient,
  userId,
  organizationId,
  batchMs = 50,
  loadMessages,
  loadTarget,
}: {
  queryClient: QueryClient;
  userId: string;
  organizationId: string | null;
  /** How long change hints collect before one refresh. */
  batchMs?: number;
  /** Reads the messages that a new-message hint adds to a loaded history. */
  loadMessages: typeof listMessages;
  /** Reads a thread's root alone, for its reply count. */
  loadTarget: typeof getMessageTarget;
}) {
  const scope = organizationId ? { userId, organizationId } : undefined;
  const cache = queryClient.getQueryCache();
  const seen = new Set<string>();
  const pending: RealtimeTarget[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  // Access checks supersede narrower reads that started before them.
  let generation = 0;

  function markStale(query: Query) {
    if (disposed || cache.get(query.queryHash) !== query) return;
    void queryClient.invalidateQueries(
      { queryKey: query.queryKey, exact: true, refetchType: "none" },
      { cancelRefetch: false },
    );
  }

  function refresh(targets: RealtimeTarget[]) {
    // Targets can overlap. Read each query once; a refreshing target wins over a stale-only one.
    const matched = new Map<Query, boolean>();
    for (const target of targets)
      for (const query of cache.findAll(targetFilter(target)))
        matched.set(query, matched.get(query) === true || target.refetchType !== "none");
    // A read in flight may predate the change, and its success would clear the staleness.
    for (const [query, refetch] of matched)
      if (!refetch && query.state.fetchStatus !== "idle")
        void query.promise?.then(
          () => markStale(query),
          () => {},
        );
    return Promise.all([
      queryClient.invalidateQueries({ predicate: (query) => matched.get(query) === true }),
      queryClient.invalidateQueries({
        predicate: (query) => matched.get(query) === false,
        refetchType: "none",
      }),
    ]);
  }

  function schedule() {
    if (disposed || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void refresh(pending.splice(0)).catch(() => {});
    }, batchMs);
  }

  return {
    /**
     * Checks access again without clearing the screen. Unmounted values go; mounted ones are
     * read again, and a denied read clears its value. Use after a reconnect or an access change.
     */
    recheck() {
      generation++;
      clearTimeout(timer);
      timer = undefined;
      pending.length = 0;
      const filter = { queryKey: queryKeys.account(userId) };
      for (const query of cache.findAll(filter)) {
        if (query.getObserversCount() === 0)
          queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
        // A disabled query is not read again, so nothing would check its value.
        else if (query.isDisabled()) query.reset();
      }
      // Cancels reads in flight: they may have started before the access change.
      return queryClient.invalidateQueries(filter);
    },
    receive(event: RealtimeChange) {
      if (disposed || event.organizationId !== organizationId || seen.has(event.id)) return;
      seen.add(event.id);
      if (seen.size > 1000) seen.delete(seen.values().next().value!);
      let targets = realtimeTargets(event, userId, organizationId);
      const epoch = generation;
      const shouldApply = () => !disposed && epoch === generation;
      // Takes one history's target out of the batch. A narrower read may replace it; when that
      // read cannot bring the history up to date, the target goes back to the batch.
      const narrow = (threadId: string | undefined, read?: () => Promise<boolean>) => {
        const taken = targets.filter(
          (target) => target.history && target.history.threadId === threadId,
        );
        targets = targets.filter((target) => !taken.includes(target));
        void read?.().then((current) => {
          if (current || !shouldApply()) return;
          pending.push(...taken);
          schedule();
        });
      };
      const { conversationId, messageId, threadId } = event;
      const newMessage = event.domain === "messaging" && event.scope === "messages";
      // The timeline or thread that a new message joins, when its hint names one.
      const location: MessagingConversationTarget | undefined =
        newMessage && conversationId && threadId !== undefined
          ? { conversationId, threadId: threadId ?? undefined }
          : undefined;
      if (scope && location && messageId) {
        // A new message changes only the newest page of its timeline or thread. Read just the
        // messages after the loaded ones instead of the whole history.
        if (canAppendNewMessages(queryClient, scope, location))
          narrow(location.threadId, () =>
            appendNewMessages(queryClient, scope, location, {
              messageId,
              load: loadMessages,
              shouldApply,
            }),
          );
        // A reply changes the timeline only in its root's reply count: read the root alone, or
        // nothing when no loaded history shows it.
        const update = location.threadId && replyCountUpdate(queryClient, scope, location);
        if (update === "none") narrow(undefined);
        if (update === "root")
          narrow(undefined, () =>
            refreshReplyCount(queryClient, scope, location, { load: loadTarget, shouldApply }),
          );
      }
      pending.push(...targets);
      schedule();
    },
    dispose() {
      disposed = true;
      generation++;
      clearTimeout(timer);
      pending.length = 0;
    },
  };
}
