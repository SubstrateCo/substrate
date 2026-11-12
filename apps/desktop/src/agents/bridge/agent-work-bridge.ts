import { channel, methods } from "@substrate/contracts/agent-work/ipc";
/* oxlint-disable deslop/no-unknown-parameters -- Main's IPC payload is parsed by handleBridge before the runtime sees it. */
import { handleBridge } from "@substrate/contracts/desktop/ipc";

import type { AgentWorkRuntime } from "../runtime/runtime.ts";

export async function dispatchAgentWork(
  runtime: AgentWorkRuntime,
  method: unknown,
  value?: unknown,
) {
  return handleBridge(channel, methods, {
    conversation: (input) => runtime.conversation(input),
    turn: (input) => runtime.turn(input),
    turnEvents: (input) => runtime.turnEvents(...input),
    agents: () => runtime.agents(),
    agentActivity: (input) => runtime.agentActivity(...input),
    sendNow: (input) => runtime.sendNow(input),
    resendItem: (input) => runtime.resendItem(input),
    discardItem: (input) => runtime.discardItem(input),
    stop: (input) => runtime.stop(input),
    retry: (input) => runtime.retry(input),
    dismiss: (input) => runtime.dismiss(input),
    startFresh: (input) => runtime.startFresh(input),
    newTopic: (input) => runtime.newTopic(input),
    "routines.list": (input) => runtime.routines.list(input),
    "routines.create": (input) => runtime.routines.create(input),
    "routines.update": (input) => runtime.routines.update(input),
    "routines.approve": (input) => runtime.routines.approve(input),
    "routines.delete": (input) => runtime.routines.delete(input),
  })(method, value);
}
