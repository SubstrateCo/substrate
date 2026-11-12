import { defineMachine } from "../state-machine.ts";

export const realtimeConnectionMachine = defineMachine({
  states: ["disconnected", "connecting", "connected", "forbidden"],
  terminal: [],
  events: {
    connect: { from: ["disconnected"], to: "connecting" },
    ready: { from: ["connecting", "connected"], to: "connected" },
    lost: { from: ["connecting", "connected"], to: "disconnected" },
    forbidden: { from: ["connecting", "connected"], to: "forbidden" },
    disconnect: {
      from: ["disconnected", "connecting", "connected", "forbidden"],
      to: "disconnected",
    },
  },
});

export type RealtimeConnectionState = (typeof realtimeConnectionMachine.states)[number];
export type RealtimeConnectionEvent = keyof typeof realtimeConnectionMachine.events;
