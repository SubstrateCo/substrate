import { mcpTools } from "@substrate/contracts/harness/tools";

import { notInBackground, writeGate } from "./write-gate";
import { expect, test } from "bun:test";

test("handoff turns may not write at all", () => {
  for (const tool of ["reply", "create_task", "update_task"] as const)
    expect(writeGate({ purpose: "handoff", kind: "interactive" }, tool)).toContain("save_handoff");
});

test("background turns may only reply and create or update tasks; interactive turns may run any write", () => {
  const unattended = { kind: "unattended" as const };
  for (const tool of ["reply", "create_task", "update_task"] as const)
    expect(writeGate(unattended, tool)).toBeNull();
  for (const tool of [
    "move_task",
    "create_project",
    "get_task_discussion",
    "attach_message",
  ] as const)
    expect(writeGate(unattended, tool)).toBe(notInBackground);
  expect(writeGate({ kind: "interactive" }, "create_project")).toBeNull();
});

test("every CRM mutation uses the existing interactive-only write gate", () => {
  for (const [name, definition] of Object.entries(mcpTools)) {
    if (!name.includes("_crm_") || definition.readOnly) continue;
    // SAFETY: all CRM tools in the registry have server scope.
    const tool = name as import("@substrate/contracts/harness/tools").ServerToolName;
    expect(writeGate({ kind: "unattended" }, tool)).toBe(notInBackground);
    expect(writeGate({ kind: "interactive" }, tool)).toBeNull();
    expect(writeGate({ kind: "interactive", purpose: "handoff" }, tool)).toContain("save_handoff");
  }
});
