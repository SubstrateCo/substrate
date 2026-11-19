import type { ProjectDetail } from "../types";

type Actor = ProjectDetail["actors"][number];

/** The trigger text for an assignee: their name, "Unassigned", or a placeholder for a lost one. */
export function assigneeLabel(value: string | null, actors: readonly Actor[]) {
  if (!value) return "Unassigned";
  return actors.find((actor) => actor.entityId === value)?.name ?? "Former member";
}
