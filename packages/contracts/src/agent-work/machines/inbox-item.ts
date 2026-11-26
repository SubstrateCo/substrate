import { defineMachine } from "../../state-machine.ts";
import { inboxStatuses } from "../turns.ts";

export const inboxItemMachine = defineMachine({
  states: inboxStatuses,
  terminal: ["dropped", "superseded", "expired"],
  events: {
    /** A claimed turn takes the item into its batch, or the item is steered into a live turn. */
    submit: { from: ["pending", "confirmed_unconsumed"], to: "submitted" },
    /** The turn ended normally, or the harness reported that it read the item. */
    consume: { from: ["submitted", "uncertain"], to: "consumed" },
    /** A held tool call of a live turn received the decision itself, so the item never runs. */
    receiveInline: { from: ["pending", "confirmed_unconsumed"], to: "consumed" },
    /** An interrupt receipt says the steered item was still queued. */
    requeue: { from: ["submitted"], to: "confirmed_unconsumed" },
    /** A steered item has no consumption evidence when its turn ends or its steer fails. */
    unconfirm: { from: ["submitted"], to: "uncertain" },
    /** The turn's process died with the steered item unconfirmed. */
    interrupt: { from: ["submitted", "uncertain"], to: "uncertain" },
    /** The turn never started, so its batch waits again. */
    unclaim: { from: ["submitted"], to: "pending" },
    /** The steer command proved the item was not delivered. */
    revertSteer: { from: ["submitted", "uncertain"], to: "pending" },
    /** The owner sends an uncertain item again. */
    resend: { from: ["uncertain"], to: "pending" },
    /** The source became inaccessible, or the helper or routine behind the item ended. */
    drop: { from: ["pending", "confirmed_unconsumed", "submitted", "consumed"], to: "dropped" },
    /** The owner dismissed the turn that holds the item. */
    dismiss: { from: ["submitted", "uncertain"], to: "dropped" },
    /** The owner decides an uncertain item needs nothing more. */
    discard: { from: ["uncertain"], to: "dropped" },
    /** A newer tick of the same routine replaces it. */
    supersede: { from: ["pending"], to: "superseded" },
  },
});
