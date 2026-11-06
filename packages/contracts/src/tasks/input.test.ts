import { expect, test } from "bun:test";
import { tasksWrite } from "./input";
import { contextSourceTask } from "../context/input";

const projectEntityId = "00000000-0000-4000-8000-000000000001";

test("task creation accepts five fixed statuses and rejects custom status values", () => {
  const input = { action: "createTask", organizationId: "org", projectEntityId, title: "Ship" };
  for (const status of ["not_started", "in_progress", "in_review", "completed", "canceled"]) {
    expect(tasksWrite.parse({ ...input, status })).toMatchObject({ status });
  }
  expect(tasksWrite.safeParse({ ...input, status: "blocked" }).success).toBe(false);
  expect(tasksWrite.safeParse({ ...input, status: projectEntityId }).success).toBe(false);
  expect(
    tasksWrite.safeParse({ ...input, action: "addStatus", name: "Review", category: "active" })
      .success,
  ).toBe(false);
});

test("message-sourced tasks use the same fixed status validation", () => {
  const input = {
    organizationId: "org",
    projectEntityId,
    messageId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    title: "Ship",
  };
  expect(contextSourceTask.parse({ ...input, status: "in_review" })).toMatchObject({
    status: "in_review",
  });
  expect(contextSourceTask.safeParse({ ...input, status: "blocked" }).success).toBe(false);
});
