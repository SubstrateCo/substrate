/* oxlint-disable deslop/no-unknown-parameters -- The preload forwards typed API inputs over IPC; main parses each one. */
import type { AgentWorkAPI } from "@substrate/contracts/agent-work/desktop";

import type { AgentWorkMethod } from "./agent-work-bridge.ts";

/** The renderer API over one IPC invoke function, as the preload exposes it. */
export function agentWorkAPI(
  invoke: (method: AgentWorkMethod, value?: unknown) => Promise<never>,
  subscribe: AgentWorkAPI["onChange"],
): AgentWorkAPI {
  return {
    conversation: (conversationId) => invoke("conversation", conversationId),
    turn: (turnId) => invoke("turn", turnId),
    turnEvents: (turnId, after) => invoke("turnEvents", [turnId, after]),
    agents: () => invoke("agents"),
    agentActivity: (agentId, cursor) => invoke("agentActivity", [agentId, cursor]),
    sendNow: (itemId) => invoke("sendNow", itemId),
    resendItem: (itemId) => invoke("resendItem", itemId),
    discardItem: (itemId) => invoke("discardItem", itemId),
    stop: (turnId) => invoke("stop", turnId),
    retry: (turnId) => invoke("retry", turnId),
    dismiss: (turnId) => invoke("dismiss", turnId),
    startFresh: (turnId) => invoke("startFresh", turnId),
    newTopic: (conversationId) => invoke("newTopic", conversationId),
    routines: {
      list: (agentId) => invoke("routines.list", agentId),
      create: (input) => invoke("routines.create", input),
      update: (input) => invoke("routines.update", input),
      approve: (input) => invoke("routines.approve", input),
      delete: (routineId) => invoke("routines.delete", routineId),
    },
    onChange: subscribe,
  };
}
