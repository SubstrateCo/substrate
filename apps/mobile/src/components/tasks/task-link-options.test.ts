import { taskLinkCandidates } from "./task-link-options";
import { expect, test } from "bun:test";

test("link choices exclude self but keep readable tasks from a different project", () => {
  const tasks = [{ entityId: "self" }, { entityId: "other-project-task" }];
  expect(taskLinkCandidates({ project: { archivedAt: null }, tasks }, "self")).toEqual([tasks[1]!]);
});

test("unavailable or archived project details cannot supply link choices", () => {
  expect(taskLinkCandidates(undefined, "self")).toEqual([]);
  expect(
    taskLinkCandidates(
      {
        project: { archivedAt: "2026-11-25" },
        tasks: [{ entityId: "hidden" }],
      },
      "self",
    ),
  ).toEqual([]);
});

test("link choices keep completed and canceled targets and their navigation metadata", () => {
  const tasks = [
    { entityId: "completed", status: "completed", projectEntityId: "destination" },
    { entityId: "canceled", status: "canceled", projectEntityId: "destination" },
  ];
  expect(taskLinkCandidates({ project: { archivedAt: null }, tasks }, "source")).toEqual(tasks);
});

test("a refreshed project replaces candidates rather than retaining removed tasks", () => {
  const before = {
    project: { archivedAt: null },
    tasks: [{ entityId: "removed" }, { entityId: "retained" }],
  };
  expect(taskLinkCandidates(before, "source").map((task) => task.entityId)).toEqual([
    "removed",
    "retained",
  ]);
  expect(
    taskLinkCandidates({ ...before, tasks: [before.tasks[1]!] }, "source").map(
      (task) => task.entityId,
    ),
  ).toEqual(["retained"]);
});
