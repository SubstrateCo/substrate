import { defineMachine } from "@substrate/contracts/state-machine";

export const nativeSessionMachine = defineMachine({
  states: ["opening", "idle", "running", "draining", "closing", "closed"],
  terminal: ["closed"],
  events: {
    connected: { from: ["opening"], to: "idle" },
    startTurn: { from: ["idle"], to: "running" },
    finishTurn: { from: ["running"], to: "idle" },
    drain: { from: ["running"], to: "draining" },
    close: { from: ["opening", "idle", "running", "draining"], to: "closing" },
    disconnected: { from: ["closing"], to: "closed" },
    openFailed: { from: ["opening", "closing"], to: "closed" },
  },
});

export type NativeSessionState = (typeof nativeSessionMachine.states)[number];

export function transitionSession(
  session: { state: NativeSessionState },
  event: keyof typeof nativeSessionMachine.events,
) {
  const next = nativeSessionMachine.next(session.state, event);
  if (next === null) throw new Error(`Cannot ${event} a native session in ${session.state}.`);
  session.state = next;
}
