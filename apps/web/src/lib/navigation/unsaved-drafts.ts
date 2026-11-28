type AskToDiscard = (names: readonly string[]) => Promise<boolean>;

type Draft = { ask: AskToDiscard; name?: string };

const drafts = new Set<Draft>();

export function registerUnsavedDraft(ask: AskToDiscard, name?: string) {
  const draft: Draft = { ask, name };
  drafts.add(draft);
  return () => {
    drafts.delete(draft);
  };
}

export function unsavedDraftNames() {
  return [...new Set([...drafts].flatMap((draft) => (draft.name ? [draft.name] : [])))];
}

export async function confirmDiscardDrafts() {
  const first = [...drafts].at(0);
  return first ? first.ask(unsavedDraftNames()) : true;
}

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
