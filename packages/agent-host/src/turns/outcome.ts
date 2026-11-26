import type { TurnOutcome } from "@substrate/contracts/agent-work";

import type { TurnOutput } from "../runtime/context.ts";

/**
 * What a finished turn amounts to. A question or proposal ends the turn waiting for the owner,
 * so it wins over the reply that carried it. A turn without outputs was quiet.
 */
export function turnOutcome(outputs: TurnOutput[]): TurnOutcome {
  const requests = (kind: "question" | "proposal") =>
    outputs.some((output) => output.kind === "request" && output.requestKind === kind);
  if (requests("question")) return "asked";
  if (requests("proposal")) return "proposed";
  if (outputs.some((output) => output.kind === "message")) return "replied";
  return "silent";
}
