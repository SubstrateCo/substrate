import { expect, test } from "bun:test";
import { requireTasksOrigin, requireTasksWorkspace } from "./tasks-policy";
import { tasksWrite } from "./tasks-contract";

test("tasks reject stale workspaces and foreign or missing write origins", () => {
  expect(requireTasksWorkspace("one", "one")).toBe("one");
  for (const active of [undefined, null, "two"])
    expect(() => requireTasksWorkspace("one", active)).toThrow("active workspace changed");
  for (const origin of [null, "null", "https://foreign.test"])
    expect(() => requireTasksOrigin(origin, "https://app.test")).toThrow("Invalid request origin");
  expect(() => requireTasksOrigin("https://app.test", "https://app.test/path")).not.toThrow();
});

test("task input rejects missing projects, blank content, and invalid dates or priorities", () => {
  const base = {
    organizationId: "org",
    projectEntityId: crypto.randomUUID(),
    action: "createTask",
    title: "Ship",
  };
  expect(tasksWrite.safeParse(base).success).toBe(true);
  for (const change of [
    { projectEntityId: undefined },
    { title: " " },
    { dueDate: "2026-02-31" },
    { priority: "highest" },
  ])
    expect(tasksWrite.safeParse({ ...base, ...change }).success).toBe(false);
});
