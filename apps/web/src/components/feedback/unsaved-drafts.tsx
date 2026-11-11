import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

function createDrafts() {
  let keys: readonly string[] = [];
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => keys,
    register(key: string) {
      keys = [...keys, key];
      listeners.forEach((listener) => listener());
      return () => {
        keys = keys.filter((item) => item !== key);
        listeners.forEach((listener) => listener());
      };
    },
  };
}

const Drafts = createContext<ReturnType<typeof createDrafts> | null>(null);

export function UnsavedDraftsProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(createDrafts);
  return <Drafts.Provider value={drafts}>{children}</Drafts.Provider>;
}

export function useRegisterDraft(key: string, dirty: boolean) {
  const drafts = useContext(Drafts);
  useLayoutEffect(() => {
    if (dirty) return drafts?.register(key);
  }, [drafts, key, dirty]);
}

export function RegisterDraft({ name, dirty }: { name: string; dirty: boolean }) {
  useRegisterDraft(name, dirty);
  return null;
}

export function useDraftKeys() {
  const drafts = useContext(Drafts);
  if (!drafts) throw new Error("UnsavedDraftsProvider is required.");
  return useSyncExternalStore(drafts.subscribe, drafts.snapshot, drafts.snapshot);
}
