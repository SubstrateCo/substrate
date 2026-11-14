import { defineMachine } from "../../state-machine.ts";
import { helperStatuses } from "../turns.ts";

export const helperMachine = defineMachine({
  states: helperStatuses,
  terminal: ["finished", "failed", "stopped"],
  events: {
    finish: { from: ["running"], to: "finished" },
    /** The helper ended without a report. */
    fail: { from: ["running"], to: "failed" },
    stop: { from: ["running"], to: "stopped" },
  },
});
