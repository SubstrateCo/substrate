import type { AgentWorkAPI } from "@startup-os/contracts/agent-work/desktop";

/** The home desktop's local agent work. Browsers and other renderers have no bridge. */
export function hasAgentWorkBridge() {
  return !!window.startupOSAgentWork;
}

export function agentWorkBridge(): AgentWorkAPI {
  const bridge = window.startupOSAgentWork;
  if (!bridge) throw new Error("Open the desktop app that runs this agent.");
  return bridge;
}
