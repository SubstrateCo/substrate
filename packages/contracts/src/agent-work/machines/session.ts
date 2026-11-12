import { defineMachine } from "../../state-machine.ts";
import { agentSessionStatuses } from "../turns.ts";

/** A local agent session on the home desktop. */
export const sessionMachine = defineMachine({
  states: agentSessionStatuses,
  // closed is reserved: no event reaches it today.
  terminal: ["closed"],
  events: {
    /** A turn of the session is claimed, retried, or started fresh. */
    work: { from: ["idle", "working"], to: "working" },
    /** The session's turn ended, needs the owner, or was removed before it started. */
    rest: { from: ["idle", "working"], to: "idle" },
  },
});
