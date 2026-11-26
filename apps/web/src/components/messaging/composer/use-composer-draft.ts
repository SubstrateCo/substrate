import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ComposerDrafts } from "@/components/messaging/composer/composer-draft-context";
import type { ReferenceEditorHandle } from "@/components/messaging/references/reference-editor";

export const messageMaxLength = 20000;

export function useComposerDraft({
  draftKey,
  pending,
  onSend,
  hasAttachments = false,
  attachmentsReady = true,
  submitDisabled = false,
  autoFocus = false,
}: {
  draftKey: string;
  pending: boolean;
  onSend: (body: string, onSuccess: () => void) => void;
  hasAttachments?: boolean;
  attachmentsReady?: boolean;
  submitDisabled?: boolean;
  /** Focuses the end of the draft on mount. */
  autoFocus?: boolean;
}) {
  const drafts = useContext(ComposerDrafts);
  if (!drafts) throw new Error("Composer requires ComposerDraftProvider");
  const draft = drafts.get(draftKey) ?? "";
  const setDraft = (value: string) => drafts.set(draftKey, value);
  // Focus waits until a send finishes, because the editor is disabled while it is pending.
  const [pendingCaret, setPendingCaret] = useState<number | null>(null);
  const [initialFocus] = useState(autoFocus ? draft.length : null);
  const editor = useRef<ReferenceEditorHandle>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);
  const composing = useRef(false);
  const setComposing = (value: boolean) => {
    composing.current = value;
  };
  const isComposing = () => composing.current;
  useLayoutEffect(() => {
    if (!selection.current) return;
    editor.current?.focusRange(selection.current.start, selection.current.end);
    selection.current = null;
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Restore the selection after the editor applies the new draft.
  }, [draft]);
  // Runs on every mount, so focus survives an editor remount.
  useEffect(() => {
    if (initialFocus !== null) editor.current?.focusAt(initialFocus);
  }, [initialFocus]);
  useEffect(() => {
    if (pendingCaret === null || pending) return;
    editor.current?.focusAt(pendingCaret);
    // oxlint-disable-next-line react/set-state-in-effect -- The request is spent only after the editor has the committed draft and is enabled; one extra render clears it.
    setPendingCaret(null);
  }, [pendingCaret, pending]);
  const requestFocus = (caret = 0) => setPendingCaret(caret);
  const canSend =
    (draft.trim() !== "" || hasAttachments) &&
    attachmentsReady &&
    !submitDisabled &&
    draft.length <= messageMaxLength;
  const submit = () => {
    if (!canSend || pending || composing.current) return;
    onSend(draft.trim(), () => {
      drafts.clear(draftKey, draft);
      requestFocus();
    });
  };
  const insert = (prefix: string, suffix = "") => {
    const { start, end } = editor.current?.getSelection() ?? {
      start: draft.length,
      end: draft.length,
    };
    selection.current = {
      start: start + prefix.length,
      end: suffix ? end + prefix.length : start + prefix.length,
    };
    setDraft(draft.slice(0, start) + prefix + draft.slice(start, end) + suffix + draft.slice(end));
  };
  return {
    draft,
    setDraft,
    editor,
    setComposing,
    isComposing,
    canSend,
    submit,
    insert,
    requestFocus,
  };
}
