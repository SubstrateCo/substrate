import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ComposerDrafts } from "./composer-drafts";
import { Send } from "lucide-react";
import { ComposerToolbar } from "./composer-toolbar";
import { Textarea } from "../primitives/textarea";
import { FormMessage } from "../auth/form-message";
import { EmojiPicker } from "./emoji-picker";
import { PendingButton } from "../feedback/pending-button";
import type { ReactNode } from "react";

export function Composer({
  onSend,
  pending = false,
  error,
  label,
  defaultValue = "",
  draftKey,
  renderReferences,
}: {
  onSend: (body: string, onSuccess: () => void) => void;
  pending?: boolean;
  error?: Error | null;
  label: string;
  defaultValue?: string;
  draftKey?: string;
  renderReferences?: (
    query: string,
    onInsert: (token: string) => void,
    onClose: () => void,
  ) => ReactNode;
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
  const [references, setReferences] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const appliedFocus = useRef(0);
  const currentDestination = useRef(draftKey);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);
  const composing = useRef(false);
  const referencePicker = useRef<HTMLDivElement>(null);
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
  const submit = () => {
    if (!draft.trim() || pending || composing.current) return;
    onSend(draft.trim(), () => {
      setDraft("");
      if (currentDestination.current === draftKey) setFocusRequest((previous) => previous + 1);
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
  const closeReferences = () => {
    setReferences(false);
    setFocusRequest((previous) => previous + 1);
  };
  const insertReference = (token: string) => {
    setDraft(
      /(?:^|\s)@[^\s[\]]*$/.test(draft)
        ? draft.replace(/@[^\s[\]]*$/, `${token} `)
        : `${draft}${draft.endsWith(" ") || !draft ? "" : " "}${token} `,
    );
    closeReferences();
  };
  return (
    <form
      className="relative space-y-2 p-3 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <FormMessage
        error={error}
        errorDescription="Your message couldn’t be sent. Your draft is still here. Try sending it again."
      />
      <div className="overflow-hidden rounded-xl border bg-card shadow-raised transition-shadow focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/15">
        <ComposerToolbar pending={pending} onInsert={insert} />
        <Textarea
          variant="composer"
          ref={textarea}
          aria-label={label}
          placeholder={label}
          value={draft}
          maxLength={20000}
          disabled={pending}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            setReferences(/(?:^|\s)@[^\s[\]]*$/.test(event.currentTarget.value));
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            if (!composing.current) setReferences(/(?:^|\s)@[^\s[\]]*$/.test(event.target.value));
          }}
          rows={1}
          className="min-h-10 max-h-[25dvh] resize-none"
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || composing.current) return;
            if (references && renderReferences && !event.shiftKey) {
              if (event.key === "Escape") {
                event.preventDefault();
                closeReferences();
                return;
              }
              if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
                event.preventDefault();
                referencePicker.current
                  ?.querySelector<HTMLInputElement>('[role="combobox"]')
                  ?.focus();
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {references && renderReferences && (
          <div ref={referencePicker}>
            {renderReferences(
              /(?:^|\s)@([^\s[\]]*)$/.exec(draft)?.[1] ?? "",
              insertReference,
              closeReferences,
            )}
          </div>
        )}
        <div className="flex items-center justify-between px-2 pb-2">
          <EmojiPicker onSelect={(emoji) => insert(emoji)} disabled={pending} />
          <PendingButton
            type="submit"
            size="sm"
            className="min-w-16"
            disabled={!draft.trim()}
            pending={pending}
            pendingLabel="Sending…"
          >
            <Send className="size-3.5" />
            Send
          </PendingButton>
        </div>
      </div>
    </form>
  );
}
