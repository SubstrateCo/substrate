import { defineMachine } from "../../state-machine.ts";
import { agentRequestStatuses } from "../requests.ts";

/** An agent request on the server. Blocking requests are closed by their home desktop. */
export const requestMachine = defineMachine({
  states: agentRequestStatuses,
  terminal: ["delivered", "executed", "failed", "cancelled", "expired", "orphaned"],
  events: {
    /** The owner answers a permission or question while it is open. */
    answer: { from: ["pending"], to: "resolved" },
    /** The owner declines a proposal. */
    decline: { from: ["pending"], to: "resolved" },
    /** The owner approves a proposal; its action runs next. */
    approve: { from: ["pending"], to: "executing" },
    execute: { from: ["executing"], to: "executed" },
    fail: { from: ["executing"], to: "failed" },
    /** The home desktop handed the answer to the native callback. */
    deliver: { from: ["resolved"], to: "delivered" },
    cancel: { from: ["pending"], to: "cancelled" },
    expire: { from: ["pending"], to: "expired" },
    /** The native callback went away. */
    orphan: { from: ["pending", "resolved"], to: "orphaned" },
  },
});
