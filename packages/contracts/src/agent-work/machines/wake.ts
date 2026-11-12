import { defineMachine } from "../../state-machine.ts";

/** A wake is pending until its home desktop stores it. The server keeps this as acked_at. */
export const agentWakeStates = ["pending", "acked"] as const;
export type AgentWakeState = (typeof agentWakeStates)[number];

export const wakeMachine = defineMachine({
  states: agentWakeStates,
  terminal: ["acked"],
  events: {
    ack: { from: ["pending"], to: "acked" },
  },
});
