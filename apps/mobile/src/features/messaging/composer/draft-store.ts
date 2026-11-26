import type { ReferenceLabels } from "../references/token-draft";
import type { SendRequest } from "./send-request";

/** What survives leaving a conversation: the text, its reference labels, and a send in flight. */
export type StoredDraft = { body: string; labels: ReferenceLabels; request?: SendRequest };

export const emptyDraft: StoredDraft = { body: "", labels: {} };

/** One draft per user, workspace, conversation, and thread. */
export function draftKey(
  userId: string,
  organizationId: string,
  conversationId: string,
  threadId?: string,
) {
  return `${userId}:${organizationId}:${conversationId}:${threadId ?? "main"}`;
}

/**
 * Drafts live in memory only, like the web composer's. They survive navigation, not an app
 * restart, and private-state resets clear them on sign-out, workspace switch and access loss.
 */
export function createDraftStore() {
  const drafts = new Map<string, StoredDraft>();
  const listeners = new Map<string, Set<() => void>>();
  const notify = (key: string) => listeners.get(key)?.forEach((listener) => listener());
  return {
    get: (key: string) => drafts.get(key) ?? emptyDraft,
    set(key: string, update: (draft: StoredDraft) => StoredDraft) {
      const next = update(drafts.get(key) ?? emptyDraft);
      if (!next.body && !next.request) drafts.delete(key);
      else drafts.set(key, next);
      notify(key);
    },
    subscribe(key: string, listener: () => void) {
      const set = listeners.get(key) ?? new Set();
      set.add(listener);
      listeners.set(key, set);
      return () => {
        set.delete(listener);
      };
    },
    clear() {
      drafts.clear();
      for (const key of listeners.keys()) notify(key);
    },
  };
}

export type DraftStore = ReturnType<typeof createDraftStore>;
