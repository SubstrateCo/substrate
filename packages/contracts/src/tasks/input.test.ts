import { tasksWrite } from "./input.ts";
import { expect, test } from "bun:test";

const projectEntityId = "00000000-0000-4000-8000-000000000001";
const createTask = { organizationId: "org", projectEntityId, action: "createTask", title: "Ship" };

test("new tasks need a project, a title, a real calendar date and a known priority", () => {
  expect(
    tasksWrite.safeParse({ ...createTask, dueDate: "2026-02-28", priority: "high" }).success,
  ).toBe(true);
  for (const change of [
    { projectEntityId: undefined },
    { title: " " },
    { dueDate: "2026-02-31" },
    { priority: "highest" },
  ])
    expect(tasksWrite.safeParse({ ...createTask, ...change }).success).toBe(false);
});
