import { createContext, useContext, useLayoutEffect } from "react";

type Draft = { key: string };

export function createDrafts() {
  let entries: readonly Draft[] = [];
  let keys: readonly string[] = [];
  const listeners = new Set<() => void>();
  const update = (next: readonly Draft[]) => {
    entries = next;
    keys = next.map((entry) => entry.key);
    listeners.forEach((listener) => listener());
  };
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => keys,
    register(draft: Draft) {
      update([...entries, draft]);
      return () => update(entries.filter((entry) => entry !== draft));
    },
  };
}

export const Drafts = createContext<ReturnType<typeof createDrafts> | null>(null);

/** Registers a dirty draft. */
export function useRegisterDraft(key: string, dirty: boolean) {
  const drafts = useContext(Drafts);
  useLayoutEffect(() => {
    if (dirty) return drafts?.register({ key });
  }, [drafts, key, dirty]);
}
