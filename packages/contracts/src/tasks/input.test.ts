import { tasksWrite } from "./input.ts";
import { expect, test } from "bun:test";

const id = "00000000-0000-4000-8000-000000000001";
const updateTask = {
  organizationId: "org",
  projectEntityId: id,
  taskEntityId: id,
  action: "updateTask",
};

test("a task update changes at least one task field", () => {
  expect(tasksWrite.safeParse({ ...updateTask, status: "completed" }).success).toBe(true);
  expect(tasksWrite.safeParse(updateTask).success).toBe(false);
});
