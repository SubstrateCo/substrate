import { agentStatusState, type AgentStatusState } from "@startup-os/contracts/agent-work";
import type { AgentLocalSummary } from "@startup-os/contracts/agent-work/desktop";

import type { RuntimeContext } from "./context.ts";
import type { RequestBridge } from "./requests.ts";
import type { TurnExecutor } from "./turn-executor.ts";

const statusDebounceMs = 500;

interface Published {
  state: AgentStatusState;
  queuedCount: number;
  liveConversationId?: string;
  liveThreadId?: string;
  activity?: string;
}

/**
 * Publishes each agent's status, at most once per 500 ms: needs_you for open requests and work
 * that needs the owner, working for a live turn, queued for waiting items, else idle.
 */
export function createStatusPublisher(
  context: RuntimeContext,
  deps: {
    executor: TurnExecutor;
    requests: RequestBridge;
    later: (callback: () => void, milliseconds: number) => () => void;
  },
) {
  const published = new Map<string, { value: string; version: number }>();
  let scheduled: (() => void) | undefined;

  /**
   * Questions and proposals without an answer wake, that the server still lists as open. The
   * server can remove a request without a wake, such as when its conversation is deleted. When
   * the server cannot be reached, every unanswered request counts as open.
   */
  async function stillOpen<T extends { requestId: string }>(unanswered: T[]) {
    if (!unanswered.length) return unanswered;
    try {
      const open = new Set(await context.server.openRequestIds(context.organizationId));
      return unanswered.filter((row) => open.has(row.requestId));
    } catch {
      return unanswered;
    }
  }

  async function summaries(): Promise<{ summary: AgentLocalSummary; published: Published }[]> {
    const homed = new Set(await context.store.sessions.agents(context.organizationId));
    const agents = (await context.agents.all()).filter((agent) => homed.has(agent.id));
    const ids = agents.map((agent) => agent.id);
    const [queued, uncertain, attention, asked] = await Promise.all([
      context.store.inbox.queuedCounts(),
      context.store.inbox.uncertainCounts(),
      context.store.turns.needsAttention(),
      context.store.outputs.requests(ids),
    ]);
    const answered = await context.store.inbox.answeredRequests(asked.map((row) => row.requestId));
    const waiting = await stillOpen(asked.filter((row) => !answered.has(row.requestId)));
    const liveTurns = [...deps.executor.live.values()];
    const result = [];
    for (const agent of agents) {
      const live = liveTurns.filter((turn) => turn.userAgentId === agent.id);
      const needsAttention = attention.filter(
        (turn) => turn.userAgentId === agent.id && turn.organizationId === context.organizationId,
      );
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
        const turn = await context.store.turns.get(first.turnId);
        if (first.conversationId) published.liveConversationId = first.conversationId;
        if (first.threadId) published.liveThreadId = first.threadId;
        if (turn?.activity) published.activity = turn.activity.slice(0, 200);
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
    for (const { summary, published: payload } of await summaries()) {
      const value = JSON.stringify(payload);
      const previous = published.get(summary.userAgentId);
      if (previous?.value === value) continue;
      const version = nextVersion();
      try {
        await context.server.publishStatus({
          organizationId: context.organizationId,
          userAgentId: summary.userAgentId,
          ...payload,
          version,
        });
        published.set(summary.userAgentId, { value, version });
      } catch {
        context.log("Could not publish agent status.");
      }
    }
  }

  return {
    summaries: async () => (await summaries()).map((entry) => entry.summary),
    schedule() {
      scheduled ??= deps.later(() => {
        void publish().catch(() => context.log("Could not publish agent status."));
      }, statusDebounceMs);
    },
    dispose() {
      scheduled?.();
      scheduled = undefined;
    },
  };
}
