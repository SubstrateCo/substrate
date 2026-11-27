import type { AgentRoutineView } from "@substrate/contracts/agent-work";

export type RoutineGroup = "needsYou" | "soon" | "later" | "paused";
export type RoutineFilter = "all" | "needsYou" | "active" | "paused";

const day = 24 * 60 * 60 * 1000;

/** A routine the agent wrote or changed runs only after the owner approves this revision. */
export const needsApproval = (routine: Pick<AgentRoutineView, "revision" | "approvedRevision">) =>
  routine.approvedRevision !== routine.revision;

/** Where a routine sits in the list. Approval comes first, because nothing else runs it. */
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

/** Soonest run first; routines without a next run go last, by name. */
function byNextRun(a: AgentRoutineView, b: AgentRoutineView) {
  const next = (routine: AgentRoutineView) =>
    routine.nextFireAt ? Date.parse(routine.nextFireAt) : Number.POSITIVE_INFINITY;
  return next(a) - next(b) || a.name.localeCompare(b.name);
}

/**
 * The routines that match the search and filter, in display groups. Empty groups are left out.
 * The search matches the name and the prompt, ignoring case.
 */
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

/** The overview's short list: everything that needs the owner, then the next runs. */
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
