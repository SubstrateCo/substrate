import {
  mcpTools,
  type ServerToolName,
  type ToolDefinition,
} from "@substrate/contracts/agent-tools/tools";

import { needsLiveTurn } from "./handlers";
import type { ServerTurn } from "./turn";

const handoffIsQuiet =
  "A handoff turn saves its notes with save_handoff. It does not publish or change records.";
const routinesAreInteractive =
  "Change routines only in an interactive turn, when your owner asks for it.";
const routineWrites: ReadonlySet<ServerToolName> = new Set([
  "create_routine",
  "update_routine",
  "delete_routine",
]);

export function writeGate(turn: Pick<ServerTurn, "handoff" | "kind">, tool: ServerToolName) {
  if (turn.handoff) return handoffIsQuiet;
  if (turn.kind !== "unattended") return null;
  const definition: ToolDefinition = mcpTools[tool];
  if (definition.ownWork) return null;
  if (routineWrites.has(tool)) return routinesAreInteractive;
  if (definition.liveTurnOnly) return needsLiveTurn;
  return null;
}

export function approvalNeeded(tool: ServerToolName) {
  const definition: ToolDefinition = mcpTools[tool];
  return !definition.ownWork && definition.approval === "owner";
}
