import { channel, methods } from "@substrate/contracts/agent-work/ipc";
import { handleBridge, type IpcValue } from "@substrate/contracts/desktop/ipc";

import type { AgentWorkRuntime } from "../runtime/runtime.ts";

export async function dispatchAgentWork(
  runtime: Pick<
    AgentWorkRuntime,
    | "conversation"
    | "turn"
    | "turnEvents"
    | "agents"
    | "agentActivity"
    | "sendNow"
    | "resendItem"
    | "discardItem"
    | "stop"
    | "retry"
    | "dismiss"
    | "startFresh"
    | "newTopic"
    | "routines"
  >,
  method: string,
  value?: IpcValue,
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
