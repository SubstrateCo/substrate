import { bridgeOutput, type BridgeAPI } from "../desktop/ipc.ts";
import type { AgentActivityPage, AgentConversationWork, AgentLocalSummary } from "./desktop.ts";
import {
  approveRoutineInput,
  createRoutineInput,
  updateRoutineInput,
  type AgentRoutineView,
} from "./routines.ts";
import type { AgentTurnView, TurnEventView } from "./turns.ts";
import { z } from "zod";

export const channel = "substrate:agent-work";
const id = z.uuid();
const command = { input: id };
export const methods = {
  conversation: { input: id, output: bridgeOutput<AgentConversationWork>() },
  turn: { input: id, output: bridgeOutput<AgentTurnView | null>() },
  turnEvents: {
    input: z.tuple([id, z.number().int().min(0).optional()]),
    output: bridgeOutput<TurnEventView[]>(),
  },
  agents: { input: z.undefined(), output: bridgeOutput<AgentLocalSummary[]>() },
  agentActivity: {
    input: z.tuple([id, z.string().max(40).optional()]),
    output: bridgeOutput<AgentActivityPage>(),
  },
  sendNow: command,
  resendItem: command,
  discardItem: command,
  stop: command,
  retry: command,
  dismiss: command,
  startFresh: command,
  newTopic: command,
  "routines.list": { input: id, output: bridgeOutput<AgentRoutineView[]>() },
  "routines.create": { input: createRoutineInput, output: bridgeOutput<AgentRoutineView>() },
  "routines.update": { input: updateRoutineInput, output: bridgeOutput<AgentRoutineView>() },
  "routines.approve": { input: approveRoutineInput, output: bridgeOutput<AgentRoutineView>() },
  "routines.delete": command,
};
export type AgentWorkMethods = BridgeAPI<typeof methods>;
