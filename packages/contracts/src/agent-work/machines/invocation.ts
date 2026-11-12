import { defineMachine } from "../../state-machine.ts";
import { agentInvocationStatuses } from "../invocations.ts";

/**
 * A caller's call of someone else's agent. Admission records it from received: the row is
 * inserted with the event's target state. received is never stored.
 */
export const invocationMachine = defineMachine({
  states: agentInvocationStatuses,
  terminal: ["rate_limited", "declined", "expired", "cancelled", "dropped"],
  events: {
    /** The policy lets the call run now: anyone, or ask with an allowlisted caller. */
    admit: { from: ["received"], to: "admitted" },
    /** The policy is ask: the owner decides. */
    hold: { from: ["received"], to: "pending_approval" },
    /** The caller has too many pending calls, or the agent reached its daily cap. */
    limit: { from: ["received"], to: "rate_limited" },
    /** The owner approves, or approves and allowlists the caller. The wake is created with it. */
    approve: { from: ["pending_approval"], to: "admitted" },
    decline: { from: ["pending_approval"], to: "declined" },
    /** Nobody decided within 24 hours. */
    expire: { from: ["pending_approval"], to: "expired" },
    /** The owner switched to owner only, or the call cannot run any more at decision time. */
    cancel: { from: ["pending_approval"], to: "cancelled" },
    /** The home desktop's source check found the call revoked before it ran. */
    drop: { from: ["admitted"], to: "dropped" },
  },
});
