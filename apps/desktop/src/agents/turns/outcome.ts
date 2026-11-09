import type { OutputRow } from "@startup-os/client-storage/agent-work";
import type { TurnOutcome } from "@startup-os/contracts/agent-work";

/**
 * What a finished turn amounts to. A question or proposal ends the turn waiting for the owner,
 * so it wins over the reply that carried it. A turn without outputs was quiet.
 */
export function turnOutcome(outputs: Pick<OutputRow, "targetKind" | "requestKind">[]): TurnOutcome {
  if (outputs.some((output) => output.requestKind === "question")) return "asked";
  if (outputs.some((output) => output.requestKind === "proposal")) return "proposed";
  if (outputs.some((output) => output.targetKind === "message")) return "replied";
  return "silent";
}
