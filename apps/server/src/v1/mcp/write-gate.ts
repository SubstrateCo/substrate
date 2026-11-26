import type { TurnContext } from "@substrate/contracts/harness/mcp";
import {
  mcpTools,
  type McpInput,
  type ServerToolName,
  type ToolDefinition,
} from "@substrate/contracts/harness/tools";
import { needsLiveTurn, proposableTool } from "@substrate/database/mcp";

const handoffIsQuiet =
  "A handoff turn saves its notes with save_handoff. It does not publish or change records.";

/** Why this turn may not run a write tool, or null when it may. Read tools are not gated. */
export function writeGate(turn: Pick<TurnContext, "purpose" | "kind">, tool: ServerToolName) {
  if (turn.purpose === "handoff") return handoffIsQuiet;
  // A background write waits for the owner, so it must be able to run without the turn.
  if (turn.kind === "unattended" && tool !== "reply" && !proposableTool(tool)) return needsLiveTurn;
  return null;
}

/**
 * Whether a write call waits for the owner's approval instead of running. Tools marked for
 * owner approval always wait. In a background turn every write waits, except a reply to the
 * turn's own place.
 */
export function approvalNeeded(
  turn: Pick<TurnContext, "kind">,
  tool: ServerToolName,
  input: McpInput<ServerToolName>,
) {
  const definition: ToolDefinition = mcpTools[tool];
  if (definition.readOnly) return false;
  if (definition.approval === "owner") return true;
  if (turn.kind !== "unattended") return false;
  return tool !== "reply" || ("to" in input && input.to !== undefined);
}
