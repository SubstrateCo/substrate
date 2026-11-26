import type { Task } from "../types";
import {
  defaultTaskFilters,
  filterTasks,
  hasActiveFilters,
  taskFilterValue,
  withTaskFilterValue,
} from "./task-filters";
import { expect, test } from "bun:test";

const task = (title: string, fields: Partial<Task> = {}): Task => ({
  entityId: title,
  projectEntityId: "project",
  parentTaskEntityId: null,
  title,
  description: "",
  status: "not_started",
  priority: "none",
  assigneeActorEntityId: null,
  dueDate: null,
  ...fields,
});

const tasks = [
  task("Write launch notes", {
    priority: "low",
    dueDate: "2026-11-20",
    assigneeActorEntityId: "a",
  }),
  task("Fix login bug", { priority: "urgent", status: "completed", assigneeActorEntityId: "b" }),
  task("Plan beta", { priority: "high", dueDate: "2026-11-10" }),
];
const titles = (list: Task[]) => list.map((item) => item.title);

test("text filter matches titles without regard to case", () => {
  expect(titles(filterTasks(tasks, { ...defaultTaskFilters, query: "  LAUNCH " }))).toEqual([
    "Write launch notes",
  ]);
});

test("active scope hides completed and canceled tasks", () => {
  expect(titles(filterTasks(tasks, { ...defaultTaskFilters, scope: "active" }))).toEqual([
    "Write launch notes",
    "Plan beta",
  ]);
});

test("assignee filter separates unassigned tasks from a chosen actor", () => {
  expect(titles(filterTasks(tasks, { ...defaultTaskFilters, assignee: "unassigned" }))).toEqual([
    "Plan beta",
  ]);
  expect(titles(filterTasks(tasks, { ...defaultTaskFilters, assignee: "b" }))).toEqual([
    "Fix login bug",
  ]);
});

test("priority sort puts urgent first and no priority last", () => {
  const list = [...tasks, task("Someday")];
  expect(titles(filterTasks(list, { ...defaultTaskFilters, sort: "priority" }))).toEqual([
    "Fix login bug",
    "Plan beta",
    "Write launch notes",
    "Someday",
  ]);
});

test("due date sort puts the soonest first and undated tasks last", () => {
  expect(titles(filterTasks(tasks, { ...defaultTaskFilters, sort: "dueDate" }))).toEqual([
    "Plan beta",
    "Write launch notes",
    "Fix login bug",
  ]);
});

test("filter-bar changes set scope and assignee and keep search and sort", () => {
  const filters = { ...defaultTaskFilters, query: "launch", sort: "title" as const };
  const blocked = withTaskFilterValue(filters, {
    scope: { operator: "is", values: ["blocked"] },
    assignee: { operator: "is", values: ["unassigned"] },
  });
  expect(blocked).toEqual({
    query: "launch",
    sort: "title",
    scope: "blocked",
    assignee: "unassigned",
  });
  expect(taskFilterValue(blocked)).toEqual({
    scope: { operator: "is", values: ["blocked"] },
    assignee: { operator: "is", values: ["unassigned"] },
  });
  expect(withTaskFilterValue(blocked, {})).toEqual(filters);
});

test("sorting does not count as filtering", () => {
  expect(hasActiveFilters({ ...defaultTaskFilters, sort: "title" })).toBe(false);
  expect(hasActiveFilters({ ...defaultTaskFilters, query: " " })).toBe(false);
  expect(hasActiveFilters({ ...defaultTaskFilters, scope: "active" })).toBe(true);
});
