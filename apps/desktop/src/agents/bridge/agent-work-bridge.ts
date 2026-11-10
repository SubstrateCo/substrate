import type { AgentWorkRuntime } from "../runtime/runtime.ts";
/* oxlint-disable deslop/no-unknown-parameters, deslop/no-unknown-returns -- IPC values are parsed per method here; results are structured-clone values for the renderer. */
import { z } from "zod";

const id = z.uuid();
const none = z.undefined();

/** One bridge method: main parses the IPC value with input before the runtime sees it. */
function parsed<Input extends z.ZodType>(
  input: Input,
  run: (runtime: AgentWorkRuntime, value: z.output<Input>) => unknown,
) {
  return (runtime: AgentWorkRuntime, value: unknown) => run(runtime, input.parse(value));
}

/** Every bridge method and its input. Routine inputs are parsed again by their contracts. */
const agentWorkMethods = {
  conversation: parsed(id, (runtime, value) => runtime.conversation(value)),
  turn: parsed(id, (runtime, value) => runtime.turn(value)),
  turnEvents: parsed(z.tuple([id, z.number().int().min(0).optional()]), (runtime, value) =>
    runtime.turnEvents(...value),
  ),
  agents: parsed(none, (runtime) => runtime.agents()),
  agentActivity: parsed(z.tuple([id, z.string().max(40).optional()]), (runtime, value) =>
    runtime.agentActivity(...value),
  ),
  sendNow: parsed(id, (runtime, value) => runtime.sendNow(value)),
  resendItem: parsed(id, (runtime, value) => runtime.resendItem(value)),
  discardItem: parsed(id, (runtime, value) => runtime.discardItem(value)),
  stop: parsed(id, (runtime, value) => runtime.stop(value)),
  retry: parsed(id, (runtime, value) => runtime.retry(value)),
  dismiss: parsed(id, (runtime, value) => runtime.dismiss(value)),
  startFresh: parsed(id, (runtime, value) => runtime.startFresh(value)),
  newTopic: parsed(id, (runtime, value) => runtime.newTopic(value)),
  "routines.list": parsed(id, (runtime, value) => runtime.routines.list(value)),
  "routines.create": parsed(z.unknown(), (runtime, value) => runtime.routines.create(value)),
  "routines.update": parsed(z.unknown(), (runtime, value) => runtime.routines.update(value)),
  "routines.approve": parsed(z.unknown(), (runtime, value) => runtime.routines.approve(value)),
  "routines.delete": parsed(id, (runtime, value) => runtime.routines.delete(value)),
};
export type AgentWorkMethod = keyof typeof agentWorkMethods;

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
  return agentWorkMethods[methodSchema.parse(method)](runtime, value);
}
