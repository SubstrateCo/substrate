import { contextSourceTask } from "./input";
import { expect, test } from "bun:test";

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
