import {
  folderKey,
  type InboxRow,
  type SessionRow,
  type TurnInterruption,
  type TurnRow,
} from "@substrate/client-storage/agent-work";
import { triggerRegistry, type AgentSourceMessage } from "@substrate/contracts/agent-work";
import { harnessCodesWithClassification } from "@substrate/contracts/harness";

import { envelopeItem, renderEnvelope } from "../turns/envelope.ts";
import type { LiveTurn, RuntimeContext } from "./context.ts";
import { sourceRequest } from "./source-check.ts";
import { endedStatus, errorCode, type TurnExecutor } from "./turn-executor.ts";

/**
 * Steer failures that prove the harness did not take the input: it refused before delivery,
 * or the command never reached a session with that live turn.
 */
const undeliveredSteerCodes = harnessCodesWithClassification("undelivered");

/** An unattended turn this long, while the owner waits, is asked to wrap up. */
const softBudgetMs = 10 * 60_000;
const wrapUpNote = "Your owner is waiting. Wrap up and hand off.";
/** A stopping turn without a terminal event this long is closed natively and ended. */
const stopTimeoutMs = 20_000;

/** Where a steered item stands after steerInput. */
export type SteerOutcome = "steered" | "skipped" | "pending" | "uncertain";

/**
 * Owner items whose slot is busy. The live interactive turn of the same session, in the same
 * epoch, takes them with steer when the harness can; otherwise they wait, held, until the slot
 * frees or the owner sends them now.
 */
export function createSteering(context: RuntimeContext, executor: TurnExecutor) {
  function liveInFolder(folder: string) {
    return [...executor.live.values()].find((state) => state.folderKey === folder);
  }

  /**
   * Steers one item: the whole steer protocol of the inbox. The store records it as submitted
   * to the live turn first, in one transaction that checks the turn is still live, so that the
   * turn's end and early consumption evidence see it. A steer that was certainly not delivered
   * puts it back to pending; any other failure leaves it uncertain, so that it is never
   * delivered twice. "skipped" means the turn was not live and nothing changed.
   */
  async function steerInput(state: LiveTurn, itemId: string, text: string): Promise<SteerOutcome> {
    if (!(await context.store.inbox.submitSteer(itemId, state.turnId))) return "skipped";
    try {
      await context.harness.execute({
        type: "steer",
        organizationId: context.organizationId,
        sessionId: state.sessionId,
        turnId: state.turnId,
        inputId: itemId,
        text,
      });
    } catch (error) {
      const code = errorCode(error);
      if (code !== undefined && undeliveredSteerCodes.has(code)) {
        await context.store.inbox.revertSteer(itemId, state.turnId, context.now());
        return "pending";
      }
      await context.store.inbox.uncertainSteer(itemId, state.turnId);
      return "uncertain";
    }
    await context.store.events.append(
      state.turnId,
      [{ kind: "input_submitted", data: { inputId: itemId } }],
      context.now(),
    );
    return "steered";
  }

  /** Renders one item as its own turn block and steers it into the live turn. */
  async function steerItem(
    state: LiveTurn,
    turn: TurnRow | undefined,
    item: InboxRow,
    sessionKind: SessionRow["kind"],
    messages: Map<string, AgentSourceMessage>,
  ): Promise<SteerOutcome | "dropped"> {
    const rendered = envelopeItem(item, { sessionKind, messages });
    if (!rendered) {
      await context.store.inbox.drop(context.organizationId, [item.id], "source_inaccessible");
      return "dropped";
    }
    const text = renderEnvelope({
      time: new Date(context.now()).toISOString(),
      session: sessionKind,
      kind: state.kind,
      attempt: turn?.attempt ?? 1,
      changes: [],
      items: [rendered],
      resume: null,
    });
    return steerInput(state, item.id, text);
  }

  /**
   * Ends a stopping turn that got no terminal event in time: close the native session and finish
   * the turn, so that its slot frees.
   */
  function timeout(turnId: string) {
    context.later(() => {
      void (async () => {
        const turn = await context.store.turns.get(turnId);
        if (!executor.live.has(turnId) || turn?.status !== "stopping") return;
        // The turn already stops: it keeps its recorded reason.
        await executor.end([turnId], turn.interruption ?? "stop");
      })().catch(() => context.log("Could not end a stopped agent turn."));
    }, stopTimeoutMs);
  }

  /** Asks the live turn to end. Stopping holds until the worker confirms or the timeout. */
  async function interrupt(turnId: string) {
    const result = await executor.interrupt(turnId);
    if (result === "gone") await executor.abandon(turnId, { status: "interrupted" });
    else timeout(turnId);
  }

  async function stopTurn(turnId: string, interruption: TurnInterruption) {
    if (!(await context.store.turns.stopping(turnId, interruption))) return false;
    if (executor.live.has(turnId)) await interrupt(turnId);
    // Not started yet: the start sees the status and sends nothing.
    else
      await context.store.turns.finish(
        turnId,
        { status: endedStatus(interruption) },
        context.now(),
      );
    return true;
  }

  return {
    async dispatch() {
      const waiting = await context.store.inbox.waitingOwnerItems(
        context.organizationId,
        context.now(),
      );
      if (!waiting.length) return;
      const sessions = new Map(
        (await context.store.sessions.byIds([...new Set(waiting.map((item) => item.sessionId))]))
          .filter((session) => session.organizationId === context.organizationId)
          .map((session) => [session.id, session]),
      );
      const turns = new Map<string, TurnRow | undefined>();
      const steerable: { item: InboxRow; session: SessionRow; state: LiveTurn }[] = [];
      const hold: string[] = [];
      for (const item of waiting) {
        const session = sessions.get(item.sessionId);
        if (!session) continue;
        const state = liveInFolder(folderKey(session));
        if (!state) continue;
        if (!turns.has(state.turnId))
          turns.set(state.turnId, await context.store.turns.get(state.turnId));
        // Owner items join only interactive turns of their own session in its current epoch.
        const joins =
          triggerRegistry[item.source].steerable &&
          state.sessionId === session.id &&
          state.kind === "interactive" &&
          state.capabilities.steer &&
          !state.handoff &&
          session.rotation === null &&
          state.epoch === session.epoch &&
          turns.get(state.turnId)?.status !== "stopping" &&
          item.status === "pending";
        if (joins) steerable.push({ item, session, state });
        else if (!item.held) hold.push(item.id);
      }
      let messages: Map<string, AgentSourceMessage> | undefined;
      if (steerable.length) {
        const { messageIds, invocationIds } = sourceRequest(steerable.map(({ item }) => item));
        try {
          const sources = await context.server.sources(
            context.organizationId,
            messageIds,
            invocationIds,
          );
          // The server leaves out the message of a revoked call, so its item drops below.
          messages = new Map(sources.messages.map((message) => [message.id, message]));
        } catch {
          context.log("Could not add a message to the live turn.");
        }
      }
      for (const { item, session, state } of steerable) {
        if (messages) {
          try {
            const turn = turns.get(state.turnId);
            const outcome = await steerItem(state, turn, item, session.kind, messages);
            if (outcome === "pending" || outcome === "uncertain")
              context.log("Could not add a message to the live turn.");
            // An uncertain item waits for the owner, not for the slot.
            if (outcome === "steered" || outcome === "dropped" || outcome === "uncertain") {
              context.changed({ userAgentId: session.userAgentId, turnId: state.turnId });
              continue;
            }
          } catch {
            context.log("Could not add a message to the live turn.");
          }
        }
        if (!item.held) hold.push(item.id);
      }
      await context.store.inbox.hold(context.organizationId, hold);
      if (hold.length) context.changed({});
    },
    steerInput,
    /** Interrupts the live turn in the item's slot so that the held item runs next. */
    async sendNow(itemId: string) {
      const item = await context.store.inbox.get(context.organizationId, itemId);
      const session = item ? await context.store.sessions.get(item.sessionId) : undefined;
      if (!item || !session || session.organizationId !== context.organizationId)
        throw new Error("Item not found.");
      const state = liveInFolder(folderKey(session));
      if (!state) return;
      await stopTurn(state.turnId, "owner");
      context.changed({ userAgentId: session.userAgentId, turnId: state.turnId });
    },
    async stop(turnId: string) {
      const turn = await context.store.turns.get(turnId);
      if (!turn || turn.organizationId !== context.organizationId)
        throw new Error("Turn not found.");
      if (await stopTurn(turnId, "stop"))
        context.changed({ userAgentId: turn.userAgentId, turnId });
    },
    /** Long unattended turns are asked to wrap up while an owner item waits for their slot. */
    async enforceBudget() {
      const now = context.now();
      const waiting = await context.store.inbox.waitingOwnerItems(context.organizationId, now);
      if (!waiting.length) return;
      const sessions = await context.store.sessions.byIds([
        ...new Set(waiting.map((i) => i.sessionId)),
      ]);
      const folders = new Set(sessions.map((session) => folderKey(session)));
      for (const state of executor.live.values()) {
        if (state.kind !== "unattended" || now - state.startedAt < softBudgetMs) continue;
        if (!folders.has(state.folderKey) || !state.capabilities.steer) continue;
        const turn = await context.store.turns.get(state.turnId);
        if (!turn?.autoContinue) continue;
        await context.harness
          .execute({
            type: "steer",
            organizationId: context.organizationId,
            sessionId: state.sessionId,
            turnId: state.turnId,
            inputId: crypto.randomUUID(),
            text: wrapUpNote,
          })
          .catch(() => {});
        await context.store.turns.wrapUp(state.turnId);
        await context.store.events.append(
          state.turnId,
          [{ kind: "note", data: { text: wrapUpNote } }],
          now,
        );
      }
    },
  };
}
export type Steering = ReturnType<typeof createSteering>;
