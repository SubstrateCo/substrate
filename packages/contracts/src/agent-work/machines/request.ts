import { defineMachine } from "../../state-machine.ts";
import { agentRequestStatuses } from "../requests.ts";

/** An agent request on the server. Blocking requests are closed by their home desktop. */
export const requestMachine = defineMachine({
  states: agentRequestStatuses,
  terminal: ["delivered", "cancelled", "expired", "orphaned", "undelivered"],
  events: {
    /** The owner answers a permission or question while it is open. */
    answer: { from: ["pending"], to: "resolved" },
    /** The home desktop handed the answer to the native callback. */
    deliver: { from: ["resolved"], to: "delivered" },
    cancel: { from: ["pending"], to: "cancelled" },
    expire: { from: ["pending"], to: "expired" },
    /** The native callback went away before the owner answered. */
    orphan: { from: ["pending"], to: "orphaned" },
    /** The native callback went away after the owner answered. The answer is kept. */
    undeliver: { from: ["resolved"], to: "undelivered" },
  },
});
