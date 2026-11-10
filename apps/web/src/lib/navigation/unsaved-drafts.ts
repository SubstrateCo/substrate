/**
 * Drafts with unsaved edits that a full-document exit would lose. The router blocks in-app
 * navigation by itself; a workspace switch or a sign-out replaces the whole document, so those
 * actions call `confirmDiscardDrafts()` first. `UnsavedChangesGuard` registers while it is dirty.
 */
type AskToDiscard = () => Promise<boolean>;

const drafts = new Set<AskToDiscard>();

/** Registers a dirty draft. Returns the function that unregisters it. */
export function registerUnsavedDraft(ask: AskToDiscard) {
  drafts.add(ask);
  return () => {
    drafts.delete(ask);
  };
}

/**
 * Resolves `true` when nothing is unsaved or the person chose to discard. One question covers
 * every draft, because leaving the document loses all of them.
 */
export async function confirmDiscardDrafts() {
  const first = [...drafts].at(0);
  return first ? first() : true;
}
