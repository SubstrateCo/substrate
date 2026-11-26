import { needsLiveTurn } from "@substrate/database/mcp";

import { approvalNeeded, writeGate } from "./write-gate";
import { expect, test } from "bun:test";

test("a handoff turn runs no write tool", () => {
  for (const tool of ["reply", "create_task", "delete_task"] as const)
    expect(writeGate({ purpose: "handoff", kind: "interactive" }, tool)).toContain("save_handoff");
});

test("a background turn runs writes that can wait for approval, but not live-turn tools", () => {
  const unattended = { kind: "unattended" } as const;
  for (const tool of ["reply", "create_task", "update_crm_account", "delete_task"] as const)
    expect(writeGate(unattended, tool)).toBeNull();
  expect(writeGate(unattended, "create_meeting")).toBe(needsLiveTurn);
  expect(writeGate({ kind: "interactive" }, "create_meeting")).toBeNull();
});

test("owner-approval tools always wait; a background write waits unless it replies in place", () => {
  const interactive = { kind: "interactive" } as const;
  const unattended = { kind: "unattended" } as const;
  for (const tool of ["delete_task", "delete_project", "delete_crm_interaction"] as const) {
    expect(approvalNeeded(interactive, tool, {})).toBe(true);
    expect(approvalNeeded(unattended, tool, {})).toBe(true);
  }
  expect(approvalNeeded(interactive, "create_task", {})).toBe(false);
  expect(approvalNeeded(unattended, "create_task", {})).toBe(true);
  const inPlace = { requestId: crypto.randomUUID(), body: "Done" };
  const elsewhere = { ...inPlace, to: { conversationId: crypto.randomUUID() } };
  expect(approvalNeeded(unattended, "reply", inPlace)).toBe(false);
  expect(approvalNeeded(unattended, "reply", elsewhere)).toBe(true);
  expect(approvalNeeded(interactive, "reply", elsewhere)).toBe(false);
  expect(approvalNeeded(unattended, "get_task", {})).toBe(false);
});
