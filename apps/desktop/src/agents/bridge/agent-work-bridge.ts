import type { AgentWorkRuntime } from "../runtime/runtime.ts";
import type { AgentWorkMethod } from "./agent-work-api.ts";
/* oxlint-disable deslop/no-unknown-parameters, deslop/no-unknown-returns -- IPC values are parsed per method here; results are structured-clone values for the renderer. */
import { z } from "zod";

const id = z.uuid();
const none = z.undefined();

/** Every bridge method and its input. Routine inputs are parsed again by their contracts. */
export const agentWorkMethods = {
  conversation: id,
  turn: id,
  turnEvents: z.tuple([id, z.number().int().min(0).optional()]),
  agents: none,
  agentActivity: z.tuple([id, z.string().max(40).optional()]),
  sendNow: id,
  resendItem: id,
  discardItem: id,
  stop: id,
  retry: id,
  dismiss: id,
  startFresh: id,
  newTopic: id,
  "routines.list": id,
  "routines.create": z.unknown(),
  "routines.update": z.unknown(),
  "routines.approve": z.unknown(),
  "routines.delete": id,
} satisfies Record<AgentWorkMethod, z.ZodType>;

const methodSchema = z.enum(
  // SAFETY: the keys come from the nonempty method table above.
  Object.keys(agentWorkMethods) as [AgentWorkMethod, ...AgentWorkMethod[]],
);

/** Parses one IPC call and runs it on the runtime of the verified account. */
export async function dispatchAgentWork(
  runtime: AgentWorkRuntime,
  method: unknown,
  value?: unknown,
): Promise<unknown> {
  const name = methodSchema.parse(method);
  switch (name) {
    case "conversation":
      return runtime.conversation(agentWorkMethods.conversation.parse(value));
    case "turn":
      return runtime.turn(agentWorkMethods.turn.parse(value));
    case "turnEvents": {
      const [turnId, after] = agentWorkMethods.turnEvents.parse(value);
      return runtime.turnEvents(turnId, after);
    }
    case "agents":
      agentWorkMethods.agents.parse(value);
      return runtime.agents();
    case "agentActivity": {
      const [agentId, cursor] = agentWorkMethods.agentActivity.parse(value);
      return runtime.agentActivity(agentId, cursor);
    }
    case "sendNow":
      return runtime.sendNow(agentWorkMethods.sendNow.parse(value));
    case "resendItem":
      return runtime.resendItem(agentWorkMethods.resendItem.parse(value));
    case "discardItem":
      return runtime.discardItem(agentWorkMethods.discardItem.parse(value));
    case "stop":
      return runtime.stop(agentWorkMethods.stop.parse(value));
    case "retry":
      return runtime.retry(agentWorkMethods.retry.parse(value));
    case "dismiss":
      return runtime.dismiss(agentWorkMethods.dismiss.parse(value));
    case "startFresh":
      return runtime.startFresh(agentWorkMethods.startFresh.parse(value));
    case "newTopic":
      return runtime.newTopic(agentWorkMethods.newTopic.parse(value));
    case "routines.list":
      return runtime.routines.list(agentWorkMethods["routines.list"].parse(value));
    case "routines.create":
      return runtime.routines.create(value);
    case "routines.update":
      return runtime.routines.update(value);
    case "routines.approve":
      return runtime.routines.approve(value);
    case "routines.delete":
      return runtime.routines.delete(agentWorkMethods["routines.delete"].parse(value));
  }
}
