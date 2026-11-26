import type { TurnContext } from "@substrate/contracts/harness/mcp";
import {
  mcpTools,
  toolApps,
  type ServerToolName,
  type ToolDefinition,
} from "@substrate/contracts/harness/tools";

import { needsLiveTurn } from "./handlers";

const handoffIsQuiet =
  "A handoff turn saves its notes with save_handoff. It does not publish or change records.";

/** Why this turn may not run a write tool, or null when it may. Read tools are not gated. */
export function writeGate(turn: Pick<TurnContext, "purpose" | "kind">, tool: ServerToolName) {
  if (turn.purpose === "handoff") return handoffIsQuiet;
  const definition: ToolDefinition = mcpTools[tool];
  // Meetings tools read the live turn's transcript; live-turn-only tools act on the owner's request.
  if (
    turn.kind === "unattended" &&
    (definition.liveTurnOnly || toolApps(tool).includes("meetings"))
  )
    return needsLiveTurn;
  return null;
}

/** Whether a call waits for the owner's approval instead of running. Only deletions wait. */
export function approvalNeeded(tool: ServerToolName) {
  const definition: ToolDefinition = mcpTools[tool];
  return definition.approval === "owner";
}
