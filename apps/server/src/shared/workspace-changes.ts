import type { RealtimeHint } from "@substrate/contracts/realtime";

const domains = new Set<RealtimeHint["domain"]>(["access", "organization", "session", "profile"]);

export function changesWorkspace(hints: Pick<RealtimeHint, "domain">[]) {
  return hints.some((hint) => domains.has(hint.domain));
}
