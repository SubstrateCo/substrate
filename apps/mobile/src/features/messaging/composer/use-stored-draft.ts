import { useSyncExternalStore } from "react";

import { createDraftStore, type StoredDraft } from "./draft-store";
import { onPrivateStateReset } from "@/auth/private-state";

const messageDrafts = createDraftStore();

onPrivateStateReset(() => messageDrafts.clear());

export function useStoredDraft(key: string) {
  const draft = useSyncExternalStore(
    (listener) => messageDrafts.subscribe(key, listener),
    () => messageDrafts.get(key),
  );
  return {
    draft,
    update: (update: (draft: StoredDraft) => StoredDraft) => messageDrafts.set(key, update),
    read: () => messageDrafts.get(key),
  };
}
