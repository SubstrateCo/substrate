/**
 * Turns over the v2 prompt lifecycle. A session/prompt response only acknowledges insertion
 * (PromptResponse, dist/v2/unstable/schema/types.gen.d.ts:4309); the turn ends with an idle
 * state_update (IdleStateUpdate :3977). States are snapshots: a repeated idle is not another
 * completion, so only an idle after active work ends a turn.
 *
 * The SDK does not order a response against notifications, so insertion position comes from
 * the user_message update with the response's messageId: notifications keep wire order. A
 * submission inserted after the turn's idle starts more foreground work, and the turn waits
 * for that work's idle too.
 */
import { HarnessError } from "../../errors.ts";
import type { AcpPromptResult, AcpSteerOutcome } from "../driver.ts";
import { stopResultV2 } from "./events.ts";
import {
  StateUpdate,
  type IdleStateUpdate,
  type PromptResponse,
} from "@agentclientprotocol/sdk/experimental/v2/unstable";
import { z } from "zod";

/** Waits this long for the user_message of a submission acknowledged after an idle. */
const insertionGraceMs = 1_000;
const cancelledCode = -32800;
const errorCode = z.object({ code: z.number() });

interface Submission {
  steer: boolean;
  acked: boolean;
  settled: boolean;
  messageId?: string;
  /** Sends $/cancel_request for a held steer. */
  withdraw: AbortController;
  timer?: ReturnType<typeof setTimeout>;
}

interface Turn {
  active: boolean;
  /** The idle that ends the turn once every submission is settled. */
  idle?: IdleStateUpdate;
  submissions: Submission[];
  resolve(result: AcpPromptResult): void;
  reject(error: Error): void;
}

export type SendPrompt = (signal?: AbortSignal) => Promise<PromptResponse>;

export class SessionTurns {
  /** Foreground state from the latest state_update. */
  private state: "idle" | "active" | "unknown" = "idle";
  private turn: Turn | undefined;
  /** user_message IDs seen during the current turn. */
  private readonly inserted = new Set<string>();

  constructor(private readonly ended: () => void) {}

  onState(update: StateUpdate) {
    const turn = this.turn;
    if (StateUpdate.isRunning(update) || StateUpdate.isRequiresAction(update)) {
      this.state = "active";
      if (turn) {
        turn.active = true;
        turn.idle = undefined;
      }
      return;
    }
    if (StateUpdate.isIdle(update)) {
      this.state = "idle";
      if (!turn?.active) return;
      turn.active = false;
      turn.idle = update;
      // A steer still held now would start a turn of its own: withdraw it.
      for (const submission of turn.submissions)
        if (submission.steer && !submission.acked) submission.withdraw.abort();
      this.finish(turn);
      return;
    }
    // unknown and future states are not idle (prompt-lifecycle "Session states").
    this.state = "unknown";
  }

  onUserMessage(messageId: string) {
    const turn = this.turn;
    if (!turn) return;
    this.inserted.add(messageId);
    const match = turn.submissions.find((entry) => entry.messageId === messageId);
    if (turn.idle && (match || turn.submissions.some((entry) => !entry.acked)))
      turn.idle = undefined;
    if (match) this.settle(turn, match);
  }

  async prompt(send: SendPrompt): Promise<AcpPromptResult> {
    if (this.turn) throw new HarnessError("turn-active", "A turn is already running.");
    const done = Promise.withResolvers<AcpPromptResult>();
    const turn: Turn = {
      active: this.state === "active",
      submissions: [],
      resolve: done.resolve,
      reject: done.reject,
    };
    this.turn = turn;
    const submission = this.submit(turn, false);
    send().then(
      (response) => this.ack(turn, submission, response),
      (error) => this.end(turn, error),
    );
    return done.promise;
  }

  async steer(send: SendPrompt): Promise<AcpSteerOutcome> {
    const turn = this.turn;
    if (!turn) return "promptRequired";
    const submission = this.submit(turn, true);
    try {
      const response = await send(submission.withdraw.signal);
      if (this.turn === turn) this.ack(turn, submission, response);
      return "injected";
    } catch (error) {
      if (this.turn === turn) this.settle(turn, submission);
      if (errorCode.safeParse(error).data?.code === cancelledCode) return "promptRequired";
      throw error;
    }
  }

  /** Ends the turn with error, such as a closed connection. */
  fail(error: Error) {
    if (this.turn) this.end(this.turn, error);
  }

  private submit(turn: Turn, steer: boolean) {
    const submission: Submission = {
      steer,
      acked: false,
      settled: false,
      withdraw: new AbortController(),
    };
    turn.submissions.push(submission);
    return submission;
  }

  private ack(turn: Turn, submission: Submission, response: PromptResponse) {
    if (this.turn !== turn) return;
    submission.acked = true;
    submission.messageId = response.messageId;
    // No idle yet, or its user_message came before the idle: the current work covers it.
    if (!turn.idle || this.inserted.has(response.messageId)) {
      this.settle(turn, submission);
      return;
    }
    // Acknowledged after the idle: wait for its user_message to place it. An agent that never
    // sends one is treated as covered by the idle.
    submission.timer = setTimeout(() => this.settle(turn, submission), insertionGraceMs);
  }

  private settle(turn: Turn, submission: Submission) {
    if (submission.settled) return;
    submission.settled = true;
    clearTimeout(submission.timer);
    this.finish(turn);
  }

  private finish(turn: Turn) {
    if (this.turn !== turn || !turn.idle) return;
    if (!turn.submissions.every((entry) => entry.settled)) return;
    const result = stopResultV2(turn.idle);
    if (result instanceof HarnessError) {
      this.end(turn, result);
      return;
    }
    this.clear(turn);
    turn.resolve(result);
  }

  private end(turn: Turn, error: Error) {
    if (this.turn !== turn) return;
    this.clear(turn);
    turn.reject(error);
  }

  private clear(turn: Turn) {
    this.turn = undefined;
    this.inserted.clear();
    for (const submission of turn.submissions) clearTimeout(submission.timer);
    this.ended();
  }
}
