import { turnRunView } from "@substrate/client-storage/agent-work";
import type { WorkspaceApiRequest, WorkspaceApiResult } from "@substrate/contracts/agent-tools/mcp";
import { turnEventsPageSize, type AgentHomedHere } from "@substrate/contracts/agent-work/desktop";
import type { HarnessEvent } from "@substrate/contracts/harness-runtime";

import type { ChangeSink, RuntimeTimers } from "../ports.ts";
import { createLocalTools } from "../tools/local-tools.ts";
import { toolOutputs } from "../turns/tool-results.ts";
import type { RuntimeContext } from "./context.ts";
import { createEpochs } from "./epochs.ts";
import { createRequestBridge } from "./requests.ts";
import { createSteering } from "./steering.ts";
import { createTurnExecutor } from "./turn-executor.ts";

/** The host cycle runs at least this often: claims, stops, retries and continued turns. */
const cycleIntervalMs = 30_000;
/**
 * The server shows a device as online for 90 s after its last call, and leases its live turns
 * for 3 minutes. The heartbeat renews both.
 */
const heartbeatMs = 60_000;
/** Realtime hints within this window become one cycle. */
const hintWindowMs = 300;

/**
 * The agent host for one account and organization on the home desktop. The server owns the
 * work queue and every turn's lifecycle: the host claims turns into free slots, runs them in
 * native harness sessions, and reports their progress and end. Harness events are written to
 * the local transcript first.
 */
export function createAgentWorkRuntime(
  base: Omit<RuntimeContext, "changed" | "progressed" | "later">,
  options: RuntimeTimers &
    ChangeSink & {
      device: { name: string; platform: string };
    },
) {
  let stopped = false;
  /** Shutting down: live turns end, and nothing new starts. */
  let draining = false;
  const timers = new Set<() => void>();
  let cycling: Promise<void> | undefined;
  let again = false;
  let hinted: (() => void) | undefined;

  const context: RuntimeContext = {
    ...base,
    changed(change) {
      if (stopped) return;
      options.notify(change);
      pump();
    },
    progressed(change) {
      if (!stopped) options.notify(change);
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
  const org = context.organizationId;
  // The request bridge reports through the executor, which needs the bridge itself.
  let executor: ReturnType<typeof createTurnExecutor>;
  const requests = createRequestBridge(context, {
    report: (live, state) => void executor.progress(live, { attempt: live.attempt, state }),
    isLive: (live) => executor.live.get(live.turnId) === live,
  });
  const epochs = createEpochs(context);
  executor = createTurnExecutor(context, { requests, epochs });
  const steering = createSteering(context, executor);
  const localTools = createLocalTools(context, { executor });

  /**
   * One pass over the server: reports held-back turn ends, applies the server's view of this
   * device's live turns (stops, moves, continued and retried turns, recovery after a restart),
   * claims work into free slots, and steers waiting items into live turns.
   */
  async function cycle() {
    await executor.reportEnds();
    await executor.reconcile(await context.host.sync(org));
    if (draining || stopped) return;
    executor.startClaimed(await context.host.claim(org, [...executor.heldFolders]));
    await steering.dispatch();
  }

  function pump() {
    if (stopped || draining) return;
    if (cycling) {
      again = true;
      return;
    }
    cycling = cycle()
      .catch(() => context.log("Could not reach Substrate for agent work."))
      .finally(() => {
        cycling = undefined;
        if (again) {
          again = false;
          pump();
        }
      });
  }

  async function refreshSettings() {
    await epochs
      .refreshSettings()
      .catch(() => context.log("Could not refresh agent sessions after a settings change."));
  }

  /** Agent-work hints: a burst, such as the echoes of this desktop's own reports, runs once. */
  function hint() {
    hinted ??= context.later(() => {
      hinted = undefined;
      pump();
      if (requests.waiting())
        void requests.deliver().catch(() => context.log("Could not deliver agent answers."));
    }, hintWindowMs);
  }

  function dispose() {
    stopped = true;
    for (const clear of timers) clear();
    timers.clear();
    requests.dispose();
  }

  async function ranHere(turnId: string) {
    const runs = await context.store.turnRuns.forTurn(org, turnId);
    if (!runs.length) throw new Error("Turn not found.");
    return runs;
  }

  return {
    async start() {
      await context.server
        .register(options.device)
        .catch(() => context.log("Could not register this desktop."));
      await epochs.rotateOutdatedPolicy().catch(() => {});
      await refreshSettings();
      timers.add(
        options.every(() => {
          void context.server.heartbeat().catch(() => context.log("Could not reach the server."));
        }, heartbeatMs),
      );
      timers.add(
        options.every(() => {
          pump();
          if (requests.waiting())
            void requests.deliver().catch(() => context.log("Could not deliver agent answers."));
        }, cycleIntervalMs),
      );
      // The first cycle recovers the turns whose harness process died with the app.
      pump();
      await cycling;
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
      await cycling;
      await executor.end([...executor.live.keys()], "retire", {
        close: () =>
          context.harness
            .closeOrganization(org)
            .catch(() => context.log("Could not close the organization's agent sessions.")),
      });
      dispose();
    },
    /**
     * Agents changed, or hints may have been missed: the next turn synchronizes the harness, and
     * sessions of agents whose apps changed rotate.
     */
    agentsChanged() {
      executor.unsynchronize();
      void refreshSettings();
    },
    /** Reconnects and session or app changes run the cycle, and deliver answers, at once. */
    async sync() {
      await refreshSettings();
      pump();
      await cycling;
      await requests.deliver().catch(() => context.log("Could not deliver agent answers."));
    },
    hint,
    onHarnessEvent(event: HarnessEvent) {
      if (event.organizationId === org) executor.onEvent(event);
    },
    /**
     * A held call waits on requestId in its live interactive turn. Until the returned function
     * runs, the request's approval_result item does not steer into that turn: the call itself
     * may still bring the decision. Null for any other call, which does not wait.
     */
    awaitApproval(request: WorkspaceApiRequest, requestId: string) {
      const state = executor.live.get(request.turn.turnId);
      if (state?.attempt !== request.turn.attempt || state.kind !== "interactive") return null;
      state.awaitingApprovals.add(requestId);
      return () => {
        state.awaitingApprovals.delete(requestId);
        // A held approval_result item may join the turn now.
        context.changed({ userAgentId: state.userAgentId, turnId: state.turnId });
      };
    },
    /**
     * Records what a server tool call published, as seen on its way through main, for the
     * turn's outcome and the transcript. decided: the call waited for approval and returned the
     * owner's decision itself, so the request's approval_result item must not steer into the
     * same turn. The server consumes that item before the agent sees the result, so it never
     * starts a later turn; the turn's end reports it again if this report fails.
     */
    async observeToolCall(
      request: WorkspaceApiRequest,
      result: WorkspaceApiResult,
      decided?: { requestId: string },
    ) {
      const held = executor.live.get(request.turn.turnId);
      if (decided && held) {
        held.decided.add(decided.requestId);
        await executor.progress(held, {
          attempt: held.attempt,
          consumedItemIds: [],
          decidedRequestIds: [decided.requestId],
        });
      }
      const found = toolOutputs(request, result);
      if (!found) return;
      const state = executor.live.get(found.turnId);
      if (!state || state.attempt !== request.turn.attempt) return;
      const createdAt = new Date(context.now()).toISOString();
      state.outputs.push(...found.outputs);
      await executor.append(
        state,
        found.outputs.map((output) => ({
          kind: "output" as const,
          data:
            output.kind === "message"
              ? {
                  kind: "message" as const,
                  id: output.id,
                  conversationId: output.conversationId,
                  threadId: output.threadId,
                  createdAt,
                }
              : { kind: output.kind, id: output.id, createdAt },
        })),
      );
      context.progressed({ userAgentId: state.userAgentId, turnId: state.turnId });
    },
    handleLocalTool: localTools,

    // Bridge API. Main checks the account and organization before it calls these.
    async turnEvents(turnId: string, after?: number) {
      await ranHere(turnId);
      return context.store.events.list(org, turnId, after ?? 0, turnEventsPageSize);
    },
    async turnRuns(turnId: string) {
      return (await context.store.turnRuns.forTurn(org, turnId)).map(turnRunView);
    },
    async homedAgents(): Promise<AgentHomedHere[]> {
      const live = [...executor.live.values()];
      return (await context.agents.all())
        .filter((agent) => agent.home)
        .map((agent) => ({
          userAgentId: agent.id,
          liveTurnIds: live.flatMap((state) =>
            state.userAgentId === agent.id ? [state.turnId] : [],
          ),
        }));
    },
    /** For tests and diagnostics. */
    liveTurnIds: () => [...executor.live.keys()],
  };
}
export type AgentWorkRuntime = ReturnType<typeof createAgentWorkRuntime>;
