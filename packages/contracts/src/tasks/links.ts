import type { TaskStatus } from "./status.ts";

/**
 * Task relations, stored as entity links. `blocks` and `duplicates` point from source to target;
 * `related_to` has no direction.
 */
export const taskLinkKinds = ["blocks", "related_to", "duplicates"] as const;
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
  "related_to",
] as const;
export type TaskLinkRelation = (typeof taskLinkRelations)[number];

export const taskLinkRelationLabels: Record<TaskLinkRelation, string> = {
  blocks: "Blocks",
  blocked_by: "Is blocked by",
  duplicates: "Duplicates",
  duplicated_by: "Is duplicated by",
  related_to: "Relates to",
};

/** The same link, seen from the other task. */
export const inverseTaskLinkRelation: Record<TaskLinkRelation, TaskLinkRelation> = {
  blocks: "blocked_by",
  blocked_by: "blocks",
  duplicates: "duplicated_by",
  duplicated_by: "duplicates",
  related_to: "related_to",
};

/** The relation a task has through a link, given the side it is on. */
export function taskLinkRelation(kind: TaskLinkKind, side: "source" | "target"): TaskLinkRelation {
  if (kind === "related_to") return "related_to";
  if (kind === "blocks") return side === "source" ? "blocks" : "blocked_by";
  return side === "source" ? "duplicates" : "duplicated_by";
}
