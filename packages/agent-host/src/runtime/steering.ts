import type { AgentSourceMessage } from "@substrate/contracts/agent-work";
import type { HostItem } from "@substrate/contracts/agent-work/control";
import { harnessCodesWithClassification } from "@substrate/contracts/harness-runtime";

import type { SteerReport } from "../ports.ts";
import { envelopeItems, renderEnvelope } from "../turns/envelope.ts";
import type { LiveTurn, RuntimeContext } from "./context.ts";
import { inaccessibleItems, sourceRequest } from "./source-check.ts";
import { errorCode, type TurnExecutor } from "./turn-executor.ts";

/**
 * Steer failures that prove the harness did not take the input: it refused before delivery,
 * or the command never reached a session with that live turn.
 */
const undeliveredSteerCodes = harnessCodesWithClassification("undelivered");

/** An unattended turn this long, while the owner waits, is asked to wrap up. */
const softBudgetMs = 10 * 60_000;
const wrapUpNote = "Your owner is waiting. Wrap up and hand off.";

/**
 * Items that wait for a live turn's folder. The server decides which of them join the live
 * turn and records them as steered into it before the host sends them; the host reports what
 * the harness did with each. The others wait, held, until the slot frees or the owner sends
 * them now.
 */
export function createSteering(context: RuntimeContext, executor: TurnExecutor) {
  const org = context.organizationId;

  async function reportSteer(state: LiveTurn, itemId: string, result: SteerReport) {
    if (result === "undelivered") state.steered.delete(itemId);
    await context.host
      .steerResult(org, itemId, { turnId: state.turnId, result })
      .catch(() => context.log("Could not report a message added to the live turn."));
  }

  /**
   * Steers one item. A steer that was certainly not delivered waits again; any other failure
   * leaves it uncertain, so that it is never delivered twice.
   */
  async function steerInput(state: LiveTurn, itemId: string, text: string) {
    try {
      await context.harness.execute({
        type: "steer",
        organizationId: org,
        sessionId: state.sessionId,
        turnId: state.turnId,
        inputId: itemId,
        text,
      });
    } catch (error) {
      const code = errorCode(error);
      context.log("Could not add a message to the live turn.");
      return reportSteer(
        state,
        itemId,
        code !== undefined && undeliveredSteerCodes.has(code) ? "undelivered" : "uncertain",
      );
    }
    await executor.append(state, [{ kind: "input_submitted", data: { inputId: itemId } }]);
    await reportSteer(state, itemId, "delivered");
  }

  /** Renders each item as its own turn block, with its source checked again first. */
  async function deliver(state: LiveTurn, items: HostItem[]) {
    for (const item of items) state.steered.add(item.id);
    let messages: Map<string, AgentSourceMessage>;
    let hidden: Set<string>;
    try {
      const sources = await context.server.sources(org, sourceRequest(items));
      messages = new Map(sources.messages.map((message) => [message.id, message]));
      hidden = new Set(inaccessibleItems(items, sources).map((item) => item.id));
    } catch {
      // Nothing was sent: the items wait again.
      context.log("Could not add a message to the live turn.");
      for (const item of items) await reportSteer(state, item.id, "undelivered");
      return;
    }
    for (const item of items) {
      const rendered = hidden.has(item.id)
        ? []
        : envelopeItems(item, { sessionKind: state.session.kind, messages });
      if (!rendered.length) {
        await reportSteer(state, item.id, "inaccessible");
        continue;
      }
      const text = renderEnvelope({
        time: new Date(context.now()).toISOString(),
        session: state.session.kind,
        kind: state.kind,
        attempt: state.attempt,
        changes: [],
        items: rendered,
        resume: null,
      });
      await steerInput(state, item.id, text);
    }
  }

  /** A long unattended turn is asked to wrap up while owner work waits for its folder. */
  async function wrapUp(state: LiveTurn) {
    if (state.kind !== "unattended" || state.wrappedUp || !state.capabilities.steer) return;
    if (context.now() - state.startedAt < softBudgetMs) return;
    state.wrappedUp = true;
    await context.harness
      .execute({
        type: "steer",
        organizationId: org,
        sessionId: state.sessionId,
        turnId: state.turnId,
        inputId: crypto.randomUUID(),
        text: wrapUpNote,
      })
      .catch(() => {});
    await executor.append(state, [{ kind: "note", data: { text: wrapUpNote } }]);
    await executor.progress(state, { attempt: state.attempt, wrappedUp: true });
  }

  /** The turn still runs here, and nothing asked it to end. */
  const running = (state: LiveTurn) =>
    executor.live.get(state.turnId) === state && !state.stopping && !state.released;

  return {
    /** Asks the server for waiting items of each live turn and delivers those that join. */
    async dispatch() {
      for (const state of executor.live.values()) {
        if (!running(state)) continue;
        let result;
        try {
          result = await context.host.steer(org, state.turnId, {
            attempt: state.attempt,
            harnessCanSteer: state.capabilities.steer,
            awaitingRequestIds: [...state.awaitingApprovals, ...state.decided],
          });
        } catch {
          continue;
        }
        if (!running(state)) {
          // The turn ended while the server claimed the items: they were never sent.
          for (const item of result.items) await reportSteer(state, item.id, "undelivered");
          continue;
        }
        if (result.items.length) {
          await deliver(state, result.items);
          context.progressed({ userAgentId: state.userAgentId, turnId: state.turnId });
        }
        if (result.waiting) await wrapUp(state);
      }
    },
  };
}
