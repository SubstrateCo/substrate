import type { TurnOutcome } from "@substrate/contracts/agent-work";

import type { TurnOutput } from "../runtime/context.ts";

export function turnOutcome(outputs: TurnOutput[]): TurnOutcome {
  const requests = (kind: "question" | "proposal") =>
    outputs.some((output) => output.kind === "request" && output.requestKind === kind);
  if (requests("question")) return "asked";
  if (requests("proposal")) return "proposed";
  if (outputs.some((output) => output.kind === "message")) return "replied";
  return "silent";
}
