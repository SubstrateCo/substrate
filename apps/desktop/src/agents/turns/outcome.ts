import type { OutputRow } from "@substrate/client-storage/agent-work";
import type { TurnOutcome } from "@substrate/contracts/agent-work";

/**
 * What a finished turn amounts to. A question ends the turn waiting for the owner, so it wins
 * over the reply that carried it. A turn without outputs was quiet.
 */
export function turnOutcome(outputs: Pick<OutputRow, "targetKind" | "requestKind">[]): TurnOutcome {
  if (outputs.some((output) => output.requestKind === "question")) return "asked";
  if (outputs.some((output) => output.targetKind === "message")) return "replied";
  return "silent";
}
