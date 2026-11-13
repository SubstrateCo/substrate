import type { TaskLinkEnd, TaskLinkView } from "@substrate/contracts/tasks/links";

import { defaultTaskFilters, filterTasks } from "../list/task-filters";
import type { Task } from "../types";
import { blockedTaskIds, taskRelations } from "./task-relations";
import { expect, test } from "bun:test";

const task = (entityId: string, status: Task["status"] = "not_started"): Task => ({
  entityId,
  projectEntityId: "project",
  parentTaskEntityId: null,
  title: entityId,
  description: "",
  status,
  priority: "none",
  assigneeActorEntityId: null,
  dueDate: null,
});
const end = (entityId: string): TaskLinkEnd => ({
  entityId,
  title: entityId,
  status: "not_started",
  projectEntityId: "project",
  projectName: "Project",
});
const link = (
  id: string,
  kind: TaskLinkView["kind"],
  source: string | null,
  target: string | null,
  blocking = kind === "blocks",
): TaskLinkView => ({
  id,
  kind,
  source: source ? end(source) : null,
  target: target ? end(target) : null,
  blocking,
});

test("a task reads each link from its own side, in the standard relation order", () => {
  const links = [
    link("related", "related_to", "a", "b"),
    link("dup", "duplicates", "c", "a"),
    link("blocker", "blocks", null, "a"),
    link("blocked", "blocks", "a", "d"),
    link("elsewhere", "blocks", "c", "d"),
  ];
  expect(
    taskRelations(links, "a").map(({ id, relation, other, blocking }) => ({
      id,
      relation,
      other: other?.entityId ?? null,
      blocking,
    })),
  ).toEqual([
    { id: "blocked", relation: "blocks", other: "d", blocking: false },
    // The reader cannot open the blocker, but the task is still blocked.
    { id: "blocker", relation: "blocked_by", other: null, blocking: true },
    { id: "dup", relation: "duplicated_by", other: "c", blocking: false },
    { id: "related", relation: "related_to", other: "b", blocking: false },
  ]);
});

test("only open tasks with an open blocker are blocked, and the filter keeps only them", () => {
  const tasks = [task("open"), task("done", "completed"), task("free"), task("unblocked")];
  const links = [
    link("1", "blocks", "free", "open"),
    link("2", "blocks", "free", "done"),
    link("3", "blocks", "done", "unblocked", false),
    link("4", "related_to", "free", "unblocked"),
  ];
  const blocked = blockedTaskIds(links, tasks);
  expect([...blocked]).toEqual(["open"]);
  expect(
    filterTasks(tasks, { ...defaultTaskFilters, scope: "blocked" }, blocked).map(
      (item) => item.entityId,
    ),
  ).toEqual(["open"]);
});
