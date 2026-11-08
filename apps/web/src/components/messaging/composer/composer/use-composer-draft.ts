import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ComposerDrafts } from "@/components/messaging/composer/composer-drafts";
import type { ReferenceEditorHandle } from "@/components/messaging/references/reference-editor";

export function useComposerDraft({
  draftKey,
  defaultValue,
  pending,
  onSend,
}: {
  draftKey?: string;
  defaultValue: string;
  pending: boolean;
  onSend: (body: string, onSuccess: () => void) => void;
}) {
  const drafts = useContext(ComposerDrafts);
  const initialDraft = () => (draftKey ? drafts?.get(draftKey) : undefined) ?? defaultValue;
  const [state, updateDraft] = useState(() => ({ key: draftKey, text: initialDraft() }));
  let draft = state.key === draftKey ? state.text : initialDraft();
  if (draftKey && drafts) draft = drafts.get(draftKey) ?? defaultValue;
  if (state.key !== draftKey) updateDraft({ key: draftKey, text: draft });
  const setDraft = (value: string) => {
    if (draftKey) drafts?.set(draftKey, value);
    updateDraft({ key: draftKey, text: value });
  };
  const [focusRequest, setFocusRequest] = useState({ id: 0, caret: 0 });
  const appliedFocus = useRef(0);
  const currentDestination = useRef(draftKey);
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
  }, [draft]);
  useEffect(() => {
    currentDestination.current = draftKey;
  }, [draftKey]);
  useEffect(() => {
    if (focusRequest.id > appliedFocus.current && !pending) {
      editor.current?.focusAt(focusRequest.caret);
      appliedFocus.current = focusRequest.id;
    }
  }, [focusRequest, pending]);
  const requestFocus = (caret = 0) =>
    setFocusRequest((previous) => ({ id: previous.id + 1, caret }));
  const submit = () => {
    if (!draft.trim() || draft.length > 20000 || pending || composing.current) return;
    onSend(draft.trim(), () => {
      if (draftKey && drafts) drafts.clear(draftKey, draft);
      else setDraft("");
      if (currentDestination.current === draftKey) requestFocus();
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
  return { draft, setDraft, editor, setComposing, isComposing, submit, insert, requestFocus };
}
