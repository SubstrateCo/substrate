import { defineMachine } from "../../state-machine.ts";
import { turnStatuses } from "../turns.ts";

const live = ["assigned", "running", "waiting", "stopping"] as const;

export const turnMachine = defineMachine({
  states: turnStatuses,
  terminal: ["completed", "cancelled", "interrupted", "failed"],
  events: {
    run: { from: ["assigned", "waiting"], to: "running" },
    /** The turn waits for the owner. */
    wait: { from: ["running"], to: "waiting" },
    /** The owner or the runtime asked the live turn to end. */
    stop: { from: live, to: "stopping" },
    complete: { from: live, to: "completed" },
    cancel: { from: live, to: "cancelled" },
    interrupt: { from: live, to: "interrupted" },
    fail: { from: live, to: "failed" },
    needAttention: { from: live, to: "needs_attention" },
    /** The harness process died and the turn continues as its next attempt. */
    continue: { from: ["assigned", "running", "waiting"], to: "assigned" },
    /** The owner runs a needs-attention turn again, in the same or a new epoch. */
    retry: { from: ["needs_attention"], to: "assigned" },
    /** The owner ends a needs-attention turn without running it again. */
    dismiss: { from: ["needs_attention"], to: "cancelled" },
    // The owner resent or discarded every uncertain item: the turn ends as it would have.
    settleCompleted: { from: ["needs_attention"], to: "completed" },
    settleCancelled: { from: ["needs_attention"], to: "cancelled" },
    settleInterrupted: { from: ["needs_attention"], to: "interrupted" },
  },
});
