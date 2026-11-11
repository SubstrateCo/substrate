import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../client";

export interface Committed<T> {
  result: T;
  hints: RealtimeHint[];
  mail?: "sharing"[];
}

export class RepositoryEffects {
  private readonly hints = new Map<string, RealtimeHint>();
  private readonly mailKinds = new Set<"sharing">();

  async activity<T>(write: () => Promise<T>, hint: RealtimeHint): Promise<T> {
    const result = await write();
    this.hint(hint);
    return result;
  }

  async notify<T extends { organizationId: string; actorId: string }>(
    write: () => Promise<T[]>,
  ): Promise<T[]> {
    const inserted = await write();
    for (const row of inserted)
      this.hint({
        audience: realtimeKeys.actor(row.organizationId, row.actorId),
        domain: "notifications",
      });
    return inserted;
  }

  hint(hint: RealtimeHint) {
    this.hints.set(JSON.stringify(hint), hint);
  }

  // A replayed request changes nothing. It still publishes the original write's hints, so viewers
  // recover from a first publish that was lost.
  replay(hints: Iterable<RealtimeHint>) {
    for (const hint of hints) this.hint(hint);
  }

  mail(kind: "sharing") {
    this.mailKinds.add(kind);
  }

  merge(effects: RepositoryEffects) {
    for (const hint of effects.hints.values()) this.hint(hint);
    for (const kind of effects.mailKinds) this.mail(kind);
  }

  committed<T>(result: T): Committed<T> {
    const committed: Committed<T> = {
      result,
      hints: [...this.hints.values()],
    };
    if (this.mailKinds.size) committed.mail = [...this.mailKinds];
    return committed;
  }
}

const collectors = new WeakMap<DatabaseExecutor, RepositoryEffects>();

export function collectedEffects(db: DatabaseExecutor) {
  return collectors.get(db);
}

// A write outside commit() has no collector to publish its hints, so it fails instead.
export function effectsFor(db: DatabaseExecutor) {
  const effects = collectors.get(db);
  if (!effects) throw new Error("Repository writes must run inside commit().");
  return effects;
}

// Every nested database transaction gets its own collector. Merge only after its savepoint succeeds.
export function effectExecutor(db: DatabaseExecutor, effects: RepositoryEffects): DatabaseExecutor {
  if (collectors.get(db) === effects) return db;
  const executor = new Proxy(db, {
    get(target, property: keyof DatabaseExecutor) {
      if (property !== "transaction") return target[property];
      return async <T>(
        work: (tx: DatabaseExecutor) => Promise<T>,
        options?: Parameters<DatabaseExecutor["transaction"]>[1],
      ) => {
        const child = new RepositoryEffects();
        const result = await target.transaction((tx) => work(effectExecutor(tx, child)), options);
        effects.merge(child);
        return result;
      };
    },
  });
  collectors.set(executor, effects);
  return executor;
}

export async function commit<T>(
  db: DatabaseExecutor,
  work: (tx: DatabaseExecutor) => Promise<T>,
): Promise<Committed<T>> {
  const effects = new RepositoryEffects();
  const result = await db.transaction((tx) => work(effectExecutor(tx, effects)));
  return effects.committed(result);
}

export function committedWrite<A extends unknown[], R>(
  write: (db: DatabaseExecutor, ...args: A) => Promise<R>,
) {
  return (db: DatabaseExecutor, ...args: A) => commit(db, (tx) => write(tx, ...args));
}

export type CommittedMethods<T, Reads extends keyof T> = {
  [P in keyof T]: P extends Reads
    ? T[P]
    : T[P] extends (...args: infer A) => Promise<infer R>
      ? (...args: A) => Promise<Committed<R>>
      : never;
};

// Every method not listed as a read runs through `run` and returns its committed effects. A new
// write is committed by default; a write wrongly listed as a read has no collector and fails.
export function commitWrites<T extends object, Reads extends keyof T>(
  repository: T,
  reads: readonly Reads[],
  run: <R>(work: (repository: T) => Promise<R>) => Promise<Committed<R>>,
): CommittedMethods<T, Reads> {
  type WriteResult = T[Exclude<keyof T, Reads>] extends (...args: never[]) => Promise<infer R>
    ? R
    : never;
  const result = { ...repository };
  const skipped = new Set<PropertyKey>(reads);
  // SAFETY: Object.keys lists the repository's own keys, so each is a key of T.
  for (const key of Object.keys(repository) as (keyof T)[]) {
    if (skipped.has(key)) continue;
    Object.defineProperty(result, key, {
      value: (...args: unknown[]) =>
        run((transactionRepository) => {
          // SAFETY: every unlisted method is an async write (CommittedMethods types others as
          // never); the wrapper forwards that method's original arguments unchanged.
          const method = transactionRepository[key] as (...args: unknown[]) => Promise<WriteResult>;
          return method.apply(transactionRepository, args);
        }),
    });
  }
  // SAFETY: reads are unchanged; every other method now returns its committed result through run.
  return result as CommittedMethods<T, Reads>;
}
