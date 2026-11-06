import { tasksWrite } from "../tasks/input";
import { contextSourceTask, contextSearch, contextLink } from "./input";
import { expect, test } from "bun:test";

test("message-sourced and direct tasks require valid calendar due dates", () => {
  const input = {
    organizationId: "workspace",
    messageId: crypto.randomUUID(),
    projectEntityId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    title: "Ship",
  };
  for (const dueDate of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10"]) {
    expect(tasksWrite.safeParse({ ...input, action: "createTask", dueDate }).success).toBe(false);
    expect(contextSourceTask.safeParse({ ...input, dueDate }).success).toBe(false);
  }
  for (const dueDate of ["2028-02-29", "2026-04-30", null, undefined]) {
    expect(tasksWrite.safeParse({ ...input, action: "createTask", dueDate }).success).toBe(true);
    expect(contextSourceTask.safeParse({ ...input, dueDate }).success).toBe(true);
  }
});

test("source task inputs require stable identities and reject invalid task fields", () => {
  const valid = {
    organizationId: "workspace",
    messageId: crypto.randomUUID(),
    projectEntityId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    title: "Ship",
  };
  expect(contextSourceTask.parse(valid).title).toBe("Ship");
  for (const patch of [
    { title: " " },
    { requestId: "invalid" },
    { priority: "critical" },
    { dueDate: "tomorrow" },
    { messageId: "bad" },
  ])
    expect(contextSourceTask.safeParse({ ...valid, ...patch }).success).toBe(false);
});
test("search and links reject unsupported domains and unbounded inputs", () => {
  for (const input of [
    { kind: "file" },
    { limit: 0 },
    { limit: 101 },
    { query: "x".repeat(201) },
    { after: "bad" },
    { relatedToEntityId: "bad" },
  ])
    expect(
      contextSearch.safeParse({ organizationId: "workspace", query: "work", ...input }).success,
    ).toBe(false);
  expect(
    contextLink.safeParse({
      organizationId: "workspace",
      messageId: crypto.randomUUID(),
      entityId: "bad",
    }).success,
  ).toBe(false);
});
