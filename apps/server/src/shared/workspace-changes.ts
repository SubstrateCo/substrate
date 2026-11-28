import type { RealtimeHint } from "@substrate/contracts/realtime";

// Membership and role changes send "access"; organization, account and name changes send the rest.
const domains = new Set<RealtimeHint["domain"]>(["access", "organization", "session", "profile"]);

/** Whether a change can alter a resolved workspace: its membership, role, actor or name. */
export function changesWorkspace(hints: Pick<RealtimeHint, "domain">[]) {
  return hints.some((hint) => domains.has(hint.domain));
}
