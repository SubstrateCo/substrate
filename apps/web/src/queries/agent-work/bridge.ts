import type { AgentWorkAPI } from "@substrate/contracts/agent-work/desktop";

import { agentWorkBridge as getBridge } from "@/lib/desktop/bridges";

/** The home desktop's local agent work. Browsers and other renderers have no bridge. */
export function hasAgentWorkBridge() {
  return !!getBridge();
}

export function agentWorkBridge(): AgentWorkAPI {
  const bridge = getBridge();
  if (!bridge) throw new Error("Open the desktop app that runs this agent.");
  return bridge;
}
