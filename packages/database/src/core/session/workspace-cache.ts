import type { DatabaseExecutor } from "../executor";
import type { SessionIdentity } from "./identity";
import { workspaceContext, type ResolvedWorkspace } from "./workspace";

const sweepSize = 5000;

export function createWorkspaceCache(
  db: DatabaseExecutor,
  ttlMs: number,
  now: () => number = Date.now,
) {
  const entries = new Map<string, { until: number; resolved: Promise<ResolvedWorkspace> }>();
  return {
    resolve(identity: SessionIdentity) {
      if (ttlMs <= 0 || identity.actorEntityId) return workspaceContext(db, identity);
      const key = JSON.stringify([identity.userId, identity.organizationId]);
      const at = now();
      const kept = entries.get(key);
      if (kept && kept.until > at) return kept.resolved;
      if (entries.size >= sweepSize)
        for (const [other, entry] of entries) if (entry.until <= at) entries.delete(other);
      const entry = { until: at + ttlMs, resolved: workspaceContext(db, identity) };
      entries.set(key, entry);
      entry.resolved.catch(() => {
        if (entries.get(key) === entry) entries.delete(key);
      });
      return entry.resolved;
    },
    forget() {
      entries.clear();
    },
  };
}
