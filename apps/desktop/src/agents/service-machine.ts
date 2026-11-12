import { defineMachine } from "@substrate/contracts/state-machine";

export const agentWorkServiceMachine = defineMachine({
  states: [
    "stopped",
    "idle",
    "opening",
    "running",
    "verifying",
    "retiring",
    "stopping",
    "restarting",
  ],
  terminal: [],
  events: {
    start: { from: ["stopped"], to: "idle" },
    check: { from: ["idle"], to: "opening" },
    recheck: { from: ["running"], to: "verifying" },
    ready: { from: ["opening", "verifying"], to: "running" },
    unavailable: { from: ["opening", "verifying"], to: "idle" },
    retire: { from: ["opening", "verifying"], to: "retiring" },
    retired: { from: ["retiring"], to: "opening" },
    stop: { from: ["idle", "opening", "running", "verifying", "retiring"], to: "stopping" },
    restart: { from: ["stopping"], to: "restarting" },
    cancelRestart: { from: ["restarting"], to: "stopping" },
    stopped: { from: ["stopping"], to: "stopped" },
    restarted: { from: ["restarting"], to: "idle" },
  },
});

export type AgentWorkServiceState = (typeof agentWorkServiceMachine.states)[number];
