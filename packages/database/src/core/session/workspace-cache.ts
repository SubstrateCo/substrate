import type { DatabaseExecutor } from "../executor";
import type { SessionIdentity } from "./identity";
import { workspaceContext, type ResolvedWorkspace } from "./workspace";

// Expired entries are dropped when the cache grows past this many.
const sweepSize = 5000;

/**
 * Keeps a person's resolved workspace for `ttlMs`, so a burst of requests resolves it once.
 *
 * Only session reads use it. Every write resolves the workspace again inside its transaction, so
 * a cached value never admits a write. A removed member, a disabled actor or a changed role
 * still reads with the old value until it expires or `forget` runs. Agent identities and failed
 * lookups are never kept.
 */
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
