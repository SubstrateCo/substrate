import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ComposerDrafts } from "@/components/messaging/composer/composer-drafts";
import type { ReferenceEditorHandle } from "@/components/messaging/references/reference-editor";

export const messageMaxLength = 20000;

export function useComposerDraft({
  draftKey,
  pending,
  onSend,
}: {
  draftKey: string;
  pending: boolean;
  onSend: (body: string, onSuccess: () => void) => void;
}) {
  const drafts = useContext(ComposerDrafts);
  if (!drafts) throw new Error("Composer requires ComposerDraftProvider");
  const draft = drafts.get(draftKey) ?? "";
  const setDraft = (value: string) => drafts.set(draftKey, value);
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
    const sendable = draft.trim() !== "" && draft.length <= messageMaxLength;
    if (!sendable || pending || composing.current) return;
    onSend(draft.trim(), () => {
      drafts.clear(draftKey, draft);
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
