/**
 * Drafts with unsaved edits that a full-document exit would lose. The router blocks in-app
 * navigation by itself; a workspace switch or a sign-out replaces the whole document, so those
 * actions exit through `leaveDocument()`. `UnsavedChangesGuard` registers while it is dirty.
 */
type AskToDiscard = (names: readonly string[]) => Promise<boolean>;

type Draft = { ask: AskToDiscard; name?: string };

const drafts = new Set<Draft>();

/**
 * Registers a dirty draft. `name` is how the question lists it ("Project details"). Returns the
 * function that unregisters it.
 */
export function registerUnsavedDraft(ask: AskToDiscard, name?: string) {
  const draft: Draft = { ask, name };
  drafts.add(draft);
  return () => {
    drafts.delete(draft);
  };
}

/** The names of every dirty draft that has one, once each, in the order they became dirty. */
export function unsavedDraftNames() {
  return [...new Set([...drafts].flatMap((draft) => (draft.name ? [draft.name] : [])))];
}

/**
 * Resolves `true` when nothing is unsaved or the person chose to discard. One question covers
 * every draft, because leaving the document loses all of them; it is given the names of all of
 * them so the dialog can list each one.
 */
export async function confirmDiscardDrafts() {
  const first = [...drafts].at(0);
  return first ? first.ask(unsavedDraftNames()) : true;
}

/**
 * Replaces the whole document, after the person agrees to lose unsaved drafts. `prepare` runs
 * between their answer and the exit, such as a sign-out; when it throws, the document stays.
 * `null` reloads the current address. Resolves `false` when they chose to keep editing.
 */
export async function leaveDocument(
  destination: string | null,
  prepare?: () => Promise<void>,
  location?: Pick<Location, "assign" | "reload">,
) {
  if (!(await confirmDiscardDrafts())) return false;
  await prepare?.();
  const document = location ?? window.location;
  if (destination === null) document.reload();
  else document.assign(destination);
  return true;
}
