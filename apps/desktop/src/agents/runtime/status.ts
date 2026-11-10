import { agentStatusState, type publishStatusInput } from "@startup-os/contracts/agent-work";
import type { AgentLocalSummary } from "@startup-os/contracts/agent-work/desktop";

import type { RuntimeContext } from "./context.ts";
import type { RequestBridge } from "./requests.ts";
import type { TurnExecutor } from "./turn-executor.ts";
import type { z } from "zod";

const statusDebounceMs = 500;
/** A change of only the activity line publishes at most this often. */
const activityIntervalMs = 10_000;

/** What a status publish says about the agent; the publisher adds the device and version. */
type Published = Pick<
  z.input<typeof publishStatusInput>,
  "state" | "queuedCount" | "liveConversationId" | "liveThreadId" | "activity"
>;

/**
 * Publishes each agent's status, at most once per 500 ms: needs_you for open requests and work
 * that needs the owner, working for a live turn, queued for waiting items, else idle. A change
 * of only the activity line, such as each tool start, publishes at most once per 10 s.
 */
export function createStatusPublisher(
  context: RuntimeContext,
  deps: { executor: TurnExecutor; requests: RequestBridge },
) {
  const published = new Map<
    string,
    { value: string; state: string; version: number; at: number }
  >();
  let scheduled: (() => void) | undefined;
  /** The server's open requests, until the next refresh. Status reads and publishes share it. */
  let openRequests: Promise<Set<string>> | undefined;

  /**
   * Questions and proposals without an answer wake, that the server still lists as open. The
   * server can remove a request without a wake, such as when its conversation is deleted. When
   * the server cannot be reached, every unanswered request counts as open.
   */
  async function stillOpen<T extends { requestId: string }>(unanswered: T[]) {
    if (!unanswered.length) return unanswered;
    const pending = (openRequests ??= context.server
      .openRequestIds(context.organizationId)
      .then((ids) => new Set(ids)));
    try {
      const open = await pending;
      return unanswered.filter((row) => open.has(row.requestId));
    } catch {
      if (openRequests === pending) openRequests = undefined;
      return unanswered;
    }
  }

  async function summaries(): Promise<{ summary: AgentLocalSummary; published: Published }[]> {
    const homed = new Set(await context.store.sessions.agents(context.organizationId));
    const agents = (await context.agents.all()).filter((agent) => homed.has(agent.id));
    const ids = agents.map((agent) => agent.id);
    const [queued, uncertain, attention, asked] = await Promise.all([
      context.store.inbox.queuedCounts(context.organizationId),
      context.store.inbox.uncertainCounts(context.organizationId),
      context.store.turns.needsAttention(context.organizationId),
      context.store.outputs.unansweredRequests(context.organizationId, ids),
    ]);
    const waiting = await stillOpen(asked);
    const liveTurns = [...deps.executor.live.values()];
    const result = [];
    for (const agent of agents) {
      const live = liveTurns.filter((turn) => turn.userAgentId === agent.id);
      const needsAttention = attention.filter((turn) => turn.userAgentId === agent.id);
      const openRequests =
        deps.requests.openCount(agent.id) +
        waiting.filter((row) => row.userAgentId === agent.id).length;
      const queuedCount = queued.get(agent.id) ?? 0;
      const state = agentStatusState({
        openRequests,
        needsAttentionTurns: needsAttention.length + (uncertain.get(agent.id) ?? 0),
        liveTurns: live.length,
        pendingItems: queuedCount,
      });
      const published: Published = { state, queuedCount };
      const first = live.at(0);
      if (first) {
        if (first.conversationId) published.liveConversationId = first.conversationId;
        if (first.threadId) published.liveThreadId = first.threadId;
        if (first.activity) published.activity = first.activity.slice(0, 200);
      }
      result.push({
        summary: {
          userAgentId: agent.id,
          harness: agent.harness,
          state,
          liveTurnIds: live.map((entry) => entry.turnId),
          queuedCount,
          needsAttentionTurnIds: needsAttention.map((entry) => entry.id),
        },
        published,
      });
    }
    return result;
  }

  /**
   * Versions are milliseconds, so a restarted runtime publishes above what it published before;
   * the tie-break keeps two publishes in the same millisecond increasing.
   */
  let lastVersion = 0;
  function nextVersion() {
    lastVersion = Math.max(lastVersion + 1, Math.floor(context.now()));
    return lastVersion;
  }

  async function publish() {
    scheduled = undefined;
    let throttled: number | undefined;
    for (const { summary, published: payload } of await summaries()) {
      const value = JSON.stringify(payload);
      const { activity: _activity, ...rest } = payload;
      const state = JSON.stringify(rest);
      const previous = published.get(summary.userAgentId);
      if (previous?.value === value) continue;
      const wait = previous ? previous.at + activityIntervalMs - context.now() : 0;
      if (previous?.state === state && wait > 0) {
        throttled = Math.min(throttled ?? wait, wait);
        continue;
      }
      const version = nextVersion();
      try {
        await context.server.publishStatus({
          organizationId: context.organizationId,
          userAgentId: summary.userAgentId,
          ...payload,
          version,
        });
        published.set(summary.userAgentId, { value, state, version, at: context.now() });
      } catch {
        context.log("Could not publish agent status.");
      }
    }
    if (throttled !== undefined) schedule(throttled);
  }

  function schedule(milliseconds = statusDebounceMs) {
    scheduled ??= context.later(() => {
      void publish().catch(() => context.log("Could not publish agent status."));
    }, milliseconds);
  }

  return {
    summaries: async () => (await summaries()).map((entry) => entry.summary),
    schedule: () => schedule(),
    /** The server's open requests may have changed: read them again, and publish. */
    refreshOpenRequests() {
      openRequests = undefined;
      schedule();
    },
    dispose() {
      scheduled?.();
      scheduled = undefined;
    },
  };
}
