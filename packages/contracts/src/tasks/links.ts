import type { TaskStatus } from "./status.ts";

/** Stored link kinds. `blocks` and `duplicates` point from source to target; `relates_to` has no direction. */
export const taskLinkKinds = ["blocks", "relates_to", "duplicates"] as const;
export type TaskLinkKind = (typeof taskLinkKinds)[number];

export interface TaskLinkEnd {
  entityId: string;
  title: string;
  status: TaskStatus;
  projectEntityId: string;
  projectName: string;
}

/** A stored link as a reader sees it. */
export interface TaskLinkView {
  id: string;
  kind: TaskLinkKind;
  /** Null when the reader cannot open that task. */
  source: TaskLinkEnd | null;
  target: TaskLinkEnd | null;
  /** A `blocks` link whose source task is still open. */
  blocking: boolean;
}

/** A link as one of its two tasks sees it. */
export const taskLinkRelations = [
  "blocks",
  "blocked_by",
  "duplicates",
  "duplicated_by",
  "relates_to",
] as const;
export type TaskLinkRelation = (typeof taskLinkRelations)[number];

export const taskLinkRelationLabels: Record<TaskLinkRelation, string> = {
  blocks: "Blocks",
  blocked_by: "Is blocked by",
  duplicates: "Duplicates",
  duplicated_by: "Is duplicated by",
  relates_to: "Relates to",
};

/** The same link, seen from the other task. */
export const inverseTaskLinkRelation: Record<TaskLinkRelation, TaskLinkRelation> = {
  blocks: "blocked_by",
  blocked_by: "blocks",
  duplicates: "duplicated_by",
  duplicated_by: "duplicates",
  relates_to: "relates_to",
};

/** The relation a task has through a link, given the side it is on. */
export function taskLinkRelation(kind: TaskLinkKind, side: "source" | "target"): TaskLinkRelation {
  if (kind === "relates_to") return "relates_to";
  if (kind === "blocks") return side === "source" ? "blocks" : "blocked_by";
  return side === "source" ? "duplicates" : "duplicated_by";
}
