import type { TurnContext } from "@substrate/contracts/harness/mcp";
import type { ServerToolName } from "@substrate/contracts/harness/tools";
import { proposeInstead } from "@substrate/database/mcp";

// In background turns the agent may only publish to its own place or propose.
const unattendedWrites: ReadonlySet<ServerToolName> = new Set(["reply", "propose"]);
const handoffIsQuiet =
  "A handoff turn saves its notes with save_handoff. It does not publish, propose or change records.";

/** Why this turn may not run a write tool, or null when it may. Read tools are not gated. */
export function writeGate(turn: Pick<TurnContext, "purpose" | "kind">, tool: ServerToolName) {
  if (turn.purpose === "handoff") return handoffIsQuiet;
  if (turn.kind === "unattended" && !unattendedWrites.has(tool)) return proposeInstead;
  return null;
}
