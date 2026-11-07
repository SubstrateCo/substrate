import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ComposerDrafts } from "@/components/messaging/composer-drafts";

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
  const draft = state.key === draftKey ? state.text : initialDraft();
  if (state.key !== draftKey) updateDraft({ key: draftKey, text: draft });
  const setDraft = (value: string) => {
    if (draftKey) drafts?.set(draftKey, value);
    updateDraft({ key: draftKey, text: value });
  };
  const [focusRequest, setFocusRequest] = useState(0);
  const appliedFocus = useRef(0);
  const currentDestination = useRef(draftKey);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);
  const composing = useRef(false);
  const setComposing = (value: boolean) => {
    composing.current = value;
  };
  const isComposing = () => composing.current;
  useLayoutEffect(() => {
    if (!selection.current) return;
    textarea.current?.focus();
    textarea.current?.setSelectionRange(selection.current.start, selection.current.end);
    selection.current = null;
  }, [draft]);
  useEffect(() => {
    currentDestination.current = draftKey;
  }, [draftKey]);
  useEffect(() => {
    if (focusRequest > appliedFocus.current && !pending) {
      textarea.current?.focus();
      appliedFocus.current = focusRequest;
    }
  }, [focusRequest, pending]);
  const requestFocus = () => setFocusRequest((previous) => previous + 1);
  const submit = () => {
    if (!draft.trim() || pending || composing.current) return;
    onSend(draft.trim(), () => {
      setDraft("");
      if (currentDestination.current === draftKey) requestFocus();
    });
  };
  const insert = (prefix: string, suffix = "") => {
    const start = textarea.current?.selectionStart ?? draft.length;
    const end = textarea.current?.selectionEnd ?? draft.length;
    selection.current = {
      start: start + prefix.length,
      end: suffix ? end + prefix.length : start + prefix.length,
    };
    setDraft(draft.slice(0, start) + prefix + draft.slice(start, end) + suffix + draft.slice(end));
  };
  return { draft, setDraft, textarea, setComposing, isComposing, submit, insert, requestFocus };
}
