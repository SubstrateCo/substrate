import { defineMachine } from "../../state-machine.ts";
import { agentSessionStatuses } from "../turns.ts";

export const sessionMachine = defineMachine({
  states: agentSessionStatuses,
  terminal: ["closed"],
  events: {
    /** A turn of the session is claimed, retried, or started fresh. */
    work: { from: ["idle", "working"], to: "working" },
    /** The session's turn ended, needs the owner, or was removed before it started. */
    rest: { from: ["idle", "working"], to: "idle" },
  },
});
