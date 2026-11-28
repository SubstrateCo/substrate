import { bridgeOutput, type BridgeAPI } from "../desktop/ipc.ts";
import type { AgentHomedHere, AgentTurnRunView } from "./desktop.ts";
import type { TurnEventView } from "./turns.ts";
import { z } from "zod";

export const channel = "substrate:agent-work";
const id = z.uuid();
export const methods = {
  /** Transcript events of a server turn that ran here, after a seq. */
  turnEvents: {
    input: z.tuple([id, z.number().int().min(0).optional()]),
    output: bridgeOutput<TurnEventView[]>(),
  },
  /** The attempts of a server turn that ran here, oldest first. Empty for other turns. */
  turnRuns: { input: id, output: bridgeOutput<AgentTurnRunView[]>() },
  /** The agents homed on this desktop, while agent work runs here. */
  homedAgents: { input: z.undefined(), output: bridgeOutput<AgentHomedHere[]>() },
};
export type AgentWorkMethods = BridgeAPI<typeof methods>;
