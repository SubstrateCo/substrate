import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Draft = { key: string; discard?: () => void };

function createDrafts() {
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
    /** Drops every registered draft that can drop itself. */
    discard() {
      for (const entry of entries) entry.discard?.();
    },
  };
}

const Drafts = createContext<ReturnType<typeof createDrafts> | null>(null);
/** Forms outside a provider, such as a create dialog, see no other drafts. */
const noDrafts = createDrafts();

export function UnsavedDraftsProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(createDrafts);
  return <Drafts.Provider value={drafts}>{children}</Drafts.Provider>;
}

/** Registers a dirty draft. `discard` drops it when the person discards every draft at once. */
export function useRegisterDraft(key: string, dirty: boolean, discard?: () => void) {
  const drafts = useContext(Drafts);
  const latest = useRef(discard);
  useLayoutEffect(() => {
    latest.current = discard;
  });
  const hasDiscard = !!discard;
  useLayoutEffect(() => {
    if (dirty)
      return drafts?.register({
        key,
        discard: hasDiscard ? () => latest.current?.() : undefined,
      });
  }, [drafts, key, dirty, hasDiscard]);
}

export function RegisterDraft({ name, dirty }: { name: string; dirty: boolean }) {
  useRegisterDraft(name, dirty);
  return null;
}

export function useDraftKeys() {
  const drafts = useContext(Drafts) ?? noDrafts;
  return useSyncExternalStore(drafts.subscribe, drafts.snapshot, drafts.snapshot);
}

/** Drops every registered draft that registered a discard. */
export function useDiscardDrafts() {
  const drafts = useContext(Drafts);
  return () => drafts?.discard();
}
