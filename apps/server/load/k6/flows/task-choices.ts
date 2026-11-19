import type { TaskPriority, TaskStatus } from "@substrate/contracts/tasks";

import { Rng } from "../../workload.ts";
import { pickResource, rng } from "../lib/persona.ts";
import type { Task } from "../lib/screens/tasks.ts";

/** Choices a person makes about tasks, shared by the live and backfill paths. */

const priorities: TaskPriority[] = ["none", "low", "medium", "high", "urgent"];
const priorityWeights = [40, 15, 25, 15, 5];

export const pickPriority = () =>
  rng.weighted(priorities, (p) => priorityWeights[priorities.indexOf(p)]!)!;

/** Work moves forward most of the time; sometimes it goes back or is dropped. */
export function nextStatus(status: TaskStatus): TaskStatus {
  const options: Record<TaskStatus, [TaskStatus, number][]> = {
    not_started: [
      ["in_progress", 75],
      ["in_review", 5],
      ["completed", 12],
      ["canceled", 8],
    ],
    in_progress: [
      ["in_review", 50],
      ["completed", 38],
      ["not_started", 8],
      ["canceled", 4],
    ],
    in_review: [
      ["completed", 75],
      ["in_progress", 25],
    ],
    completed: [
      ["in_progress", 80],
      ["in_review", 20],
    ],
    canceled: [["not_started", 100]],
  };
  return rng.weighted(options[status], ([, weight]) => weight)![0];
}

/**
 * The status a new task starts in. The form starts at "Not started"; the "+" of a board column
 * starts at that column. Backfill also stands for older tasks, so more of them are further on.
 */
export function initialStatus(backfill: boolean): TaskStatus {
  const options: [TaskStatus, number][] = backfill
    ? [
        ["not_started", 40],
        ["in_progress", 22],
        ["in_review", 8],
        ["completed", 24],
        ["canceled", 6],
      ]
    : [
        ["not_started", 80],
        ["in_progress", 14],
        ["in_review", 4],
        ["completed", 2],
      ];
  return rng.weighted(options, ([, weight]) => weight)![0];
}

/** A due date 1 to 45 days ahead, as the date picker gives it (YYYY-MM-DD). */
export function dueDate() {
  return new Date(Date.now() + rng.int(1, 45) * 86_400_000).toISOString().slice(0, 10);
}

const open = (task: Task) => task.status !== "completed" && task.status !== "canceled";

/** The same hash on every VU, so all users agree on which tasks are busy. */
const busyness = (id: string) => new Rng(id).next();

/**
 * A task to look at or work on. Open tasks, the user's own, and tasks shared VUs consider busy
 * draw more attention; finished ones are rarely touched.
 */
export function pickTask(
  tasks: Task[],
  actorId: string | undefined,
  purpose: "read" | "update" | "comment",
) {
  return pickResource(
    tasks,
    (task) => task.title,
    (task) => {
      let weight = purpose === "read" ? 0.8 : 0.25;
      if (open(task)) weight = 3;
      if (actorId && task.assigneeActorEntityId === actorId) weight *= 3;
      if (purpose === "comment") weight *= 0.3 + 3 * busyness(task.title) ** 3;
      return weight;
    },
  );
}

/** Zipf over a shared ranking, so a few items collect most writes and many stay small. */
export function skewed<T extends { title: string } | { name: string }>(
  items: T[],
  exponent: number,
) {
  const ranked = items
    .map((item) => ({ item, rank: busyness("title" in item ? item.title : item.name), weight: 0 }))
    .sort((a, b) => b.rank - a.rank);
  ranked.forEach((entry, index) => (entry.weight = 1 / Math.pow(index + 1, exponent)));
  return rng.weighted(ranked, (entry) => entry.weight)?.item;
}

const relations = ["blocked_by", "related_to", "blocks", "duplicates"] as const;

/** The picker starts at "Is blocked by"; people change it about half the time. */
export const pickRelation = () =>
  rng.chance(0.5)
    ? "blocked_by"
    : rng.weighted(relations, (r) => [0, 6, 3, 1][relations.indexOf(r)]!)!;
