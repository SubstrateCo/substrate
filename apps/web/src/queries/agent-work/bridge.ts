import type { AgentWorkAPI } from "@substrate/contracts/agent-work/desktop";

/** The home desktop's local agent work. Browsers and other renderers have no bridge. */
export function hasAgentWorkBridge() {
  return !!window.substrateAgentWork;
}

export function agentWorkBridge(): AgentWorkAPI {
  const bridge = window.substrateAgentWork;
  if (!bridge) throw new Error("Open the desktop app that runs this agent.");
  return bridge;
}
