import { needsLiveTurn } from "./handlers";
import { approvalNeeded, writeGate } from "./write-gate";
import { expect, test } from "bun:test";

test("a handoff turn runs no write tool", () => {
  for (const tool of ["reply", "create_task", "delete_task"] as const)
    expect(writeGate({ purpose: "handoff", kind: "interactive" }, tool)).toContain("save_handoff");
});

test("a background turn runs writes, but not live-turn tools", () => {
  const unattended = { kind: "unattended" } as const;
  for (const tool of ["reply", "create_task", "update_crm_account", "delete_task"] as const)
    expect(writeGate(unattended, tool)).toBeNull();
  for (const tool of ["create_meeting", "attach_task_file"] as const) {
    expect(writeGate(unattended, tool)).toBe(needsLiveTurn);
    expect(writeGate({ kind: "interactive" }, tool)).toBeNull();
  }
});

test("only deletions wait for the owner", () => {
  for (const tool of ["delete_task", "delete_project", "delete_crm_interaction"] as const)
    expect(approvalNeeded(tool)).toBe(true);
  for (const tool of ["create_task", "reply", "archive_project", "revoke_crm_access"] as const)
    expect(approvalNeeded(tool)).toBe(false);
});
