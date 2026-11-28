import type { AgentWorkTurnView } from "@substrate/contracts/agent-work";

import { turnTone } from "./status";

export type ActivityEntry<T> =
  | { kind: "turn"; turn: T }
  | { kind: "routines"; id: string; turns: T[] };

const quietRoutineRun = (turn: AgentWorkTurnView) => {
  if (turn.sessionKind !== "routine") return false;
  const tone = turnTone(turn);
  return tone === "done" || tone === "muted";
};

export function groupActivity<T extends AgentWorkTurnView>(
  turns: readonly T[],
): ActivityEntry<T>[] {
  const entries: ActivityEntry<T>[] = [];
  let run: T[] = [];
  const flush = () => {
    if (run.length > 1) entries.push({ kind: "routines", id: run[0].id, turns: run });
    else if (run.length === 1) entries.push({ kind: "turn", turn: run[0] });
    run = [];
  };
  for (const turn of turns) {
    if (quietRoutineRun(turn)) {
      run.push(turn);
      continue;
    }
    flush();
    entries.push({ kind: "turn", turn });
  }
  flush();
  return entries;
}
