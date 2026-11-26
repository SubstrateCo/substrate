/**
 * Tracks one read per owner and key, so later callers can wait for the read in flight instead of
 * starting another. A read stops being tracked when it settles, unless a newer read replaced it.
 */
export function inFlightReads<Owner extends object, T>() {
  const reads = new WeakMap<Owner, Map<string, Promise<T>>>();
  return {
    running: (owner: Owner, key: string) => reads.get(owner)?.get(key),
    async track(owner: Owner, key: string, read: Promise<T>) {
      const pending = reads.get(owner) ?? new Map<string, Promise<T>>();
      reads.set(owner, pending);
      pending.set(key, read);
      try {
        return await read;
      } finally {
        if (pending.get(key) === read) pending.delete(key);
      }
    },
  };
}
