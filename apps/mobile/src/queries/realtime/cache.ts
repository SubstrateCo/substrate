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
  batchMs?: number;
  loadMessages: typeof listMessages;
  loadTarget: typeof getMessageTarget;
}) {
  const scope = organizationId ? { userId, organizationId } : undefined;
  const cache = queryClient.getQueryCache();
  const seen = new Set<string>();
  const pending: RealtimeTarget[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let generation = 0;

  function markStale(query: Query) {
    if (disposed || cache.get(query.queryHash) !== query) return;
    void queryClient.invalidateQueries(
      { queryKey: query.queryKey, exact: true, refetchType: "none" },
      { cancelRefetch: false },
    );
  }

  function refresh(targets: RealtimeTarget[]) {
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
      const location: MessagingConversationTarget | undefined =
        newMessage && conversationId && threadId !== undefined
          ? { conversationId, threadId: threadId ?? undefined }
          : undefined;
      if (scope && location && messageId) {
        if (canAppendNewMessages(queryClient, scope, location))
          narrow(location.threadId, () =>
            appendNewMessages(queryClient, scope, location, {
              messageId,
              load: loadMessages,
              shouldApply,
            }),
          );
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
