import {
  helperView,
  itemView,
  ownerBatchWindowMs,
  ownerMessageDebounceMs,
  sessionView,
} from "@substrate/client-storage/agent-work";
import { wakeDedupeKeys, type AgentTurnView } from "@substrate/contracts/agent-work";
import {
  turnEventsPageSize,
  type AgentActivityPage,
  type AgentConversationWork,
  type AgentWorkChange,
} from "@substrate/contracts/agent-work/desktop";
import type { HarnessEvent } from "@substrate/contracts/harness";
import type { WorkspaceApiRequest, WorkspaceApiResult } from "@substrate/contracts/harness/mcp";

import { createLocalTools } from "../helpers/local-tools.ts";
import { createRoutines } from "../routines/routines.ts";
import { toolOutputs } from "../turns/tool-results.ts";
import type { RuntimeContext } from "./context.ts";
import { createEpochs } from "./epochs.ts";
import { pullWakes } from "./intake.ts";
import { createRequestBridge } from "./requests.ts";
import { createStatusPublisher } from "./status.ts";
import { createSteering } from "./steering.ts";
import { createThreadContext } from "./thread-context.ts";
import { createTurnExecutor } from "./turn-executor.ts";

const syncIntervalMs = 30_000;
/** While realtime is connected, hints drive pulls; the tick still pulls this often. */
const safetyPullMs = 5 * 60_000;
/**
 * The server shows a device as online for 90 s after its last call. While realtime replaces
 * polling, an idle desktop calls at least this often.
 */
const heartbeatMs = 60_000;
/** Realtime hints within this window become one pull. */
const hintWindowMs = 300;
const activityPageSize = 30;

/** An activity cursor is `<createdAt>:<turnId>` of the last turn on the previous page. */
function activityCursor(cursor: string) {
  const split = cursor.indexOf(":");
  const createdAt = Number(cursor.slice(0, split));
  const id = cursor.slice(split + 1);
  if (split < 1 || !Number.isSafeInteger(createdAt) || !id) throw new Error("Invalid cursor.");
  return { createdAt, id };
}

export interface RuntimeTimers {
  every(callback: () => void, milliseconds: number): () => void;
  later(callback: () => void, milliseconds: number): () => void;
}

/**
 * The agent-work runtime for one account and organization on the home desktop. Server wakes,
 * routine ticks and helper results become inbox items; the claim loop turns them into turns in
 * free slots; harness events are written to the local store first.
 */
export function createAgentWorkRuntime(
  base: Omit<RuntimeContext, "changed" | "progressed" | "later">,
  options: RuntimeTimers & {
    notify(change: AgentWorkChange): void;
    device: { name: string; platform: string };
    /** The renderer's realtime connection is up, so wakes and answers arrive as hints. */
    realtimeConnected(): boolean;
  },
) {
  let stopped = false;
  /** Shutting down: live turns end, and nothing new starts. */
  let draining = false;
  const timers = new Set<() => void>();
  let pumping: Promise<void> | undefined;
  let again = false;
  let hinted: (() => void) | undefined;
  let pulledAt = Number.NEGATIVE_INFINITY;
  let seenAt = Number.NEGATIVE_INFINITY;

  const context: RuntimeContext = {
    ...base,
    changed(change) {
      if (stopped) return;
      options.notify(change);
      status.schedule();
      pump();
    },
    progressed(change) {
      if (stopped) return;
      options.notify(change);
      status.schedule();
    },
    later(callback, milliseconds) {
      const clear = options.later(() => {
        timers.delete(clear);
        if (!stopped) callback();
      }, milliseconds);
      timers.add(clear);
      return () => {
        timers.delete(clear);
        clear();
      };
    },
  };
  const requests = createRequestBridge(context);
  const epochs = createEpochs(context);
  const executor = createTurnExecutor(context, { requests, epochs });
  const steering = createSteering(context, executor);
  const threadContext = createThreadContext(context, executor);
  const status = createStatusPublisher(context, { executor, requests });
  const routines = createRoutines(context);
  const localTools = createLocalTools(context, { executor, steering });

  /** Agents whose home device is this desktop. Only they claim and run turns here. */
  async function homeAgents() {
    return (await context.agents.all()).filter((agent) => agent.home).map((agent) => agent.id);
  }

  async function cycle() {
    await context.store.turns.claim(context.now(), {
      organizationId: context.organizationId,
      busyFolders: [...executor.heldFolders],
      userAgentIds: await homeAgents(),
    });
    await executor.startAssigned();
    await steering.dispatch();
  }

  /** Agents moved to another desktop stop here: their live work is interrupted and closed. */
  async function reconcileHome() {
    const home = new Set(await homeAgents());
    for (const state of executor.live.values())
      if (!home.has(state.userAgentId))
        await executor.end([state.turnId], "moved", { interrupt: true });
  }

  function pump() {
    if (stopped || draining) return;
    if (pumping) {
      again = true;
      return;
    }
    pumping = cycle()
      .catch(() => context.log("Agent work claim failed."))
      .finally(() => {
        pumping = undefined;
        if (again) {
          again = false;
          pump();
        }
      });
  }

  /**
   * Pulls wakes, and answers when answers is "always" or a blocking request waits for one.
   * Answers for callbacks that are gone are orphaned by the full pulls.
   */
  async function sync(answers: "always" | "waiting" = "always") {
    try {
      await epochs.refreshApps();
    } catch {
      context.log("Could not refresh enabled workspace apps.");
      return;
    }
    if (answers === "always") pulledAt = context.now();
    seenAt = context.now();
    status.refreshOpenRequests();
    const created = await pullWakes(context).catch(() => {
      context.log("Could not pull agent wakes.");
      return 0;
    });
    await threadContext.sync().catch(() => context.log("Could not sync live thread context."));
    if (created) {
      // Debounced owner messages become available later; check again when their windows close.
      context.later(pump, ownerMessageDebounceMs + 10);
      context.later(pump, ownerBatchWindowMs + 10);
      context.changed({});
    }
    if (answers === "always" || requests.waiting())
      await requests.deliver().catch(() => context.log("Could not deliver agent answers."));
    pump();
  }

  /** Agent-work hints: a burst, such as the echoes of this desktop's own writes, pulls once. */
  function hint() {
    hinted ??= context.later(() => {
      hinted = undefined;
      void sync("waiting");
    }, hintWindowMs);
  }

  /** Local work runs every tick. The server is polled while realtime is down. */
  async function tick() {
    if (!options.realtimeConnected() || context.now() - pulledAt >= safetyPullMs) await sync();
    else if (context.now() - seenAt >= heartbeatMs) {
      seenAt = context.now();
      await context.server.heartbeat().catch(() => context.log("Could not reach the server."));
    }
    await reconcileHome().catch(() => context.log("Could not check where agents run."));
    await routines.tick().catch(() => context.log("Could not run routines."));
    await steering.enforceBudget().catch(() => {});
    await threadContext.sync().catch(() => context.log("Could not sync live thread context."));
  }

  function dispose() {
    stopped = true;
    for (const clear of timers) clear();
    timers.clear();
    requests.dispose();
    status.dispose();
  }

  function itemChange(item: { userAgentId: string; turnId: string | null }): AgentWorkChange {
    return item.turnId
      ? { userAgentId: item.userAgentId, turnId: item.turnId }
      : { userAgentId: item.userAgentId };
  }

  async function ownedItem(itemId: string) {
    const item = await context.store.inbox.get(context.organizationId, itemId);
    const session = item ? await context.store.sessions.get(item.sessionId) : undefined;
    if (!item || session?.organizationId !== context.organizationId)
      throw new Error("Item not found.");
    return item;
  }

  async function ownedTurn(turnId: string) {
    const turn = await context.store.turns.get(turnId);
    if (!turn || turn.organizationId !== context.organizationId) throw new Error("Turn not found.");
    return turn;
  }

  return {
    async start() {
      // The harness process died with the app: live turns are interrupted.
      const decisions = await context.store.turns.recover(context.now(), context.organizationId);
      if (decisions.length) options.notify({});
      const interrupted = decisions.filter((decision) => decision.action !== "requeued");
      await requests
        .closeOrphans(interrupted.map((decision) => decision.turnId))
        .catch(() => context.log("Could not close agent requests."));
      for (const decision of interrupted) {
        if (decision.action === "continue") continue;
        const turn = await context.store.turns.get(decision.turnId);
        if (turn) await executor.settleHelper(turn.sessionId, turn.status).catch(() => {});
      }
      await epochs.rotateOutdatedPolicy().catch(() => {});
      await context.server
        .register(options.device)
        .catch(() => context.log("Could not register this desktop."));
      timers.add(options.every(() => void tick(), syncIntervalMs));
      await tick();
      status.schedule();
    },
    dispose,
    /**
     * When the organization or account changes: interrupt and close this organization's native
     * sessions and end their turns. The controller may already serve the new organization, so
     * the sessions close through closeOrganization, not through session commands. Their work
     * resumes when the organization is active again.
     */
    async shutdown() {
      draining = true;
      for (const clear of timers) clear();
      timers.clear();
      await executor.end([...executor.live.keys()], "retire", {
        close: () =>
          context.harness
            .closeOrganization(context.organizationId)
            .catch(() => context.log("Could not close the organization's agent sessions.")),
      });
      dispose();
    },
    reconcileHome,
    /** Agents changed, or hints may have been missed: the next turn synchronizes the harness. */
    agentsChanged: () => executor.unsynchronize(),
    /** Reconnects and session changes pull wakes and answers at once. */
    sync: () => sync(),
    hint,
    onHarnessEvent(event: HarnessEvent) {
      if (event.organizationId === context.organizationId) executor.onEvent(event);
    },
    /**
     * A held call waits on requestId in its live turn. Until the returned function runs, the
     * request's approval_result item does not steer into that turn: the call itself may still
     * bring the decision.
     */
    awaitApproval(request: WorkspaceApiRequest, requestId: string) {
      const state = executor.live.get(request.turn.turnId);
      if (!state) return () => {};
      state.awaitingApprovals.add(requestId);
      return () => {
        state.awaitingApprovals.delete(requestId);
        // A held approval_result item may join the turn now.
        context.changed({ userAgentId: state.userAgentId, turnId: state.turnId });
      };
    },
    /**
     * Records what a server tool call published, as seen on its way through main. decided: the
     * call waited for approval and returned the owner's decision itself, so the agent already
     * has the news that the request's approval_result wake would bring.
     */
    async observeToolCall(
      request: WorkspaceApiRequest,
      result: WorkspaceApiResult,
      decided?: { requestId: string },
    ) {
      if (decided) {
        const turn = await context.store.turns.get(request.turn.turnId);
        if (turn?.organizationId === context.organizationId)
          await context.store.inbox.deliveredInTurn(
            {
              sessionId: turn.sessionId,
              userAgentId: turn.userAgentId,
              source: "approval_result",
              sourceRef: {
                source: "approval_result",
                requestId: decided.requestId,
                anchorMessageId: null,
                request: null,
              },
              dedupeKey: wakeDedupeKeys.approval(decided.requestId),
            },
            context.now(),
          );
        // The decided request leaves the needs-you list.
        status.refreshOpenRequests();
      }
      const found = toolOutputs(request, result);
      if (!found) return;
      // A reply may have asked a question, or a proposal opened a request.
      status.refreshOpenRequests();
      const turn = await context.store.turns.get(found.turnId);
      if (!turn || turn.organizationId !== context.organizationId) return;
      for (const output of found.outputs) {
        const createdAt = new Date(context.now()).toISOString();
        await context.store.outputs.record(turn.id, output, context.now(), [
          {
            kind: "output",
            data:
              output.kind === "message"
                ? {
                    kind: "message",
                    id: output.id,
                    conversationId: output.conversationId,
                    threadId: output.threadId,
                    createdAt,
                  }
                : { kind: output.kind, id: output.id, createdAt },
          },
        ]);
      }
      context.changed({ userAgentId: turn.userAgentId, turnId: turn.id });
    },
    handleLocalTool: localTools,

    // Bridge API. Main checks the account and organization before it calls these.
    async conversation(conversationId: string): Promise<AgentConversationWork> {
      const sessions = await context.store.sessions.forConversation(
        context.organizationId,
        conversationId,
      );
      const ids = sessions.map((session) => session.id);
      const turns = await context.store.views.turns(await context.store.turns.forSessions(ids));
      const items = await context.store.inbox.openForSessions(ids);
      return {
        conversationId,
        sessions: sessions.map(sessionView),
        turns,
        items: items.map(itemView),
      };
    },
    async turn(turnId: string): Promise<AgentTurnView | null> {
      const row = await context.store.turns.get(turnId);
      if (!row || row.organizationId !== context.organizationId) return null;
      return (await context.store.views.turns([row])).at(0) ?? null;
    },
    async turnEvents(turnId: string, after?: number) {
      await ownedTurn(turnId);
      return context.store.events.list(turnId, after ?? 0, turnEventsPageSize);
    },
    agents: () => status.summaries(),
    async agentActivity(agentId: string, cursor?: string): Promise<AgentActivityPage> {
      const before = cursor === undefined ? undefined : activityCursor(cursor);
      const page = await context.store.turns.forAgent(context.organizationId, agentId, {
        before,
        limit: activityPageSize,
      });
      const last = page.rows.at(-1);
      const turns = await context.store.views.turns(page.rows);
      const nextCursor = page.more && last ? `${last.createdAt}:${last.id}` : null;
      // Sessions and helpers are the agent's, not the page's. Only the first page carries them.
      if (before) return { sessions: [], turns, helpers: [], nextCursor };
      const sessions = await context.store.sessions.forAgent(context.organizationId, agentId);
      const sessionIds = new Set(sessions.map((session) => session.id));
      const helpers = await context.store.helpers.forAgent(agentId);
      return {
        sessions: sessions.map(sessionView),
        turns,
        helpers: helpers.filter((helper) => sessionIds.has(helper.parentSessionId)).map(helperView),
        nextCursor,
      };
    },
    sendNow: (itemId: string) => steering.sendNow(itemId),
    stop: (turnId: string) => steering.stop(turnId),
    async retry(turnId: string) {
      await ownedTurn(turnId);
      await context.store.turns.retry(turnId, context.now());
      context.changed({ turnId });
    },
    async dismiss(turnId: string) {
      const turn = await ownedTurn(turnId);
      await context.store.turns.dismiss(turnId, context.now());
      await executor.settleHelper(turn.sessionId, "cancelled");
      context.changed({ turnId });
    },
    /** Sends an uncertain item again, in the next turn of its session. */
    async resendItem(itemId: string) {
      const item = await ownedItem(itemId);
      await context.store.inbox.resend(item.id, context.now());
      context.changed(itemChange(item));
    },
    /** Decides that an uncertain item needs nothing more. */
    async discardItem(itemId: string) {
      const item = await ownedItem(itemId);
      await context.store.inbox.discard(item.id, context.now());
      context.changed(itemChange(item));
    },
    async startFresh(turnId: string) {
      const turn = await ownedTurn(turnId);
      await executor.closeNative(turn.sessionId);
      await context.store.turns.startFresh(turnId, context.now());
      context.changed({ turnId, userAgentId: turn.userAgentId });
    },
    newTopic: (conversationId: string) => epochs.newTopic(conversationId),
    routines,
    /** For tests and diagnostics. */
    liveTurnIds: () => [...executor.live.keys()],
  };
}
export type AgentWorkRuntime = ReturnType<typeof createAgentWorkRuntime>;
