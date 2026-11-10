import { taskChanges } from "./changes";
import type { tasks } from "./tasks.schema";
import { expect, test } from "bun:test";

const task: typeof tasks.$inferSelect = {
  organizationId: "org",
  entityId: "task",
  entityType: "task",
  projectEntityId: "project",
  parentTaskEntityId: null,
  title: "Ship",
  description: "",
  status: "not_started",
  priority: "none",
  assigneeActorEntityId: null,
  dueDate: null,
};

test("each changed field records one activity entry, in a fixed order", () => {
  expect(
    taskChanges(task, {
      dueDate: "2026-12-01",
      priority: "high",
      description: "Details",
      title: "Ship it",
      assigneeActorEntityId: "bob",
      status: "in_progress",
    }),
  ).toEqual([
    "Status changed",
    "Assignee changed",
    "Title changed",
    "Description changed",
    "Priority changed",
    "Due date changed",
  ]);
});

test("unchanged, omitted and whitespace-only title edits record nothing", () => {
  expect(taskChanges(task, {})).toEqual([]);
  expect(
    taskChanges(task, { title: "  Ship ", status: "not_started", assigneeActorEntityId: null }),
  ).toEqual([]);
  expect(
    taskChanges({ ...task, assigneeActorEntityId: "bob" }, { assigneeActorEntityId: null }),
  ).toEqual(["Assignee changed"]);
});
