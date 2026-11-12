import type { AgentInvocationDropReason } from "@substrate/contracts/agent-work";

const dropReasons: Record<AgentInvocationDropReason, string> = {
  revoked: "Revoked",
  desktop_needs_update: "Desktop needs update",
};

/** Audit results may be absent on older dropped calls. */
export function callDropReason(reason: string | null) {
  if (reason === "revoked" || reason === "desktop_needs_update") return dropReasons[reason];
  return null;
}
