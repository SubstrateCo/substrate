import { activityLine } from "./activity.ts";
import { expect, test } from "bun:test";

test("tool use becomes a short line per harness and native noise is skipped", () => {
  expect(activityLine("claude", "tool_progress", { tool_name: "Bash" })).toBe("Using Bash");
  expect(activityLine("claude", "system", { subtype: "init" })).toBeNull();
  expect(
    activityLine("codex", "item/started", { item: { type: "commandExecution", command: "ls" } }),
  ).toBe("Running ls");
  expect(activityLine("codex", "item/completed", { item: { type: "fileChange" } })).toBeNull();
  expect(
    activityLine("opencode", "message.part.updated", {
      part: { tool: "read", state: { status: "running" } },
    }),
  ).toBe("Using read");
  expect(
    activityLine("opencode", "message.part.updated", {
      part: { tool: "read", state: { status: "completed" } },
    }),
  ).toBeNull();
  expect(activityLine("antigravity", "tool_call", { title: "Read file" })).toBe("Using Read file");
  expect(
    activityLine("codex", "item/started", {
      item: { type: "commandExecution", command: "x".repeat(300) },
    })?.length,
  ).toBe(200);
});
