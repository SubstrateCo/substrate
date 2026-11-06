import { expect, test } from "bun:test";
import { contextSourceTask, contextSearch, contextLink } from "./input";

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
