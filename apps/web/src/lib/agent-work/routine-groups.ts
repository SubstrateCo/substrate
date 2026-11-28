import type { AgentRoutineView } from "@substrate/contracts/agent-work";

export type RoutineGroup = "needsYou" | "soon" | "later" | "paused";
export type RoutineFilter = "all" | "needsYou" | "active" | "paused";

const day = 24 * 60 * 60 * 1000;

export const needsApproval = (routine: Pick<AgentRoutineView, "revision" | "approvedRevision">) =>
  routine.approvedRevision !== routine.revision;

function routineGroup(routine: AgentRoutineView, now: number): RoutineGroup {
  if (needsApproval(routine)) return "needsYou";
  if (!routine.enabled) return "paused";
  const next = routine.nextFireAt ? Date.parse(routine.nextFireAt) : Number.NaN;
  return next - now < day ? "soon" : "later";
}

const filterGroups: Record<RoutineFilter, readonly RoutineGroup[]> = {
  all: ["needsYou", "soon", "later", "paused"],
  needsYou: ["needsYou"],
  active: ["soon", "later"],
  paused: ["paused"],
};

function byNextRun(a: AgentRoutineView, b: AgentRoutineView) {
  const next = (routine: AgentRoutineView) =>
    routine.nextFireAt ? Date.parse(routine.nextFireAt) : Number.POSITIVE_INFINITY;
  return next(a) - next(b) || a.name.localeCompare(b.name);
}

export function groupRoutines(
  routines: readonly AgentRoutineView[],
  { now, query = "", filter = "all" }: { now: number; query?: string; filter?: RoutineFilter },
) {
  const needle = query.trim().toLowerCase();
  const matches = routines.filter(
    (routine) =>
      !needle ||
      routine.name.toLowerCase().includes(needle) ||
      routine.prompt.toLowerCase().includes(needle),
  );
  return filterGroups[filter]
    .map((group) => ({
      group,
      routines: matches.filter((routine) => routineGroup(routine, now) === group).sort(byNextRun),
    }))
    .filter((entry) => entry.routines.length > 0);
}

export function routineHighlights(
  routines: readonly AgentRoutineView[],
  { now, upcoming = 2 }: { now: number; upcoming?: number },
) {
  const groups = groupRoutines(routines, { now });
  const pick = (group: RoutineGroup) => groups.find((entry) => entry.group === group)?.routines;
  const active = [...(pick("soon") ?? []), ...(pick("later") ?? [])];
  return {
    needsYou: pick("needsYou") ?? [],
    upcoming: active.slice(0, upcoming),
    activeCount: active.length,
    pausedCount: pick("paused")?.length ?? 0,
  };
}
