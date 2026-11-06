import { useEffect, useRef, useState } from "react";
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
  renderReferences,
}: {
  onSend: (body: string, onSuccess: () => void) => void;
  pending?: boolean;
  error?: Error | null;
  label: string;
  defaultValue?: string;
  renderReferences?: (
    query: string,
    onInsert: (token: string) => void,
    onClose: () => void,
  ) => ReactNode;
}) {
  const [draft, setDraft] = useState(defaultValue);
  const [references, setReferences] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusRequest > 0) textarea.current?.focus();
  }, [focusRequest]);
  const submit = () => {
    if (!draft.trim() || pending) return;
    onSend(draft.trim(), () => {
      setDraft("");
      textarea.current?.focus();
    });
  };
  const insert = (prefix: string, suffix = "") => {
    const start = textarea.current?.selectionStart ?? draft.length;
    const end = textarea.current?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + prefix + draft.slice(start, end) + suffix + draft.slice(end));
    textarea.current?.focus();
  };
  const closeReferences = () => {
    setReferences(false);
    setFocusRequest((previous) => previous + 1);
  };
  const insertReference = (token: string) => {
    setDraft((previous) =>
      /(?:^|\s)@[^\s[\]]*$/.test(previous)
        ? previous.replace(/@[^\s[\]]*$/, `${token} `)
        : `${previous}${previous.endsWith(" ") || !previous ? "" : " "}${token} `,
    );
    closeReferences();
  };
  return (
    <form
      className="relative space-y-2 p-3 pt-2 sm:p-4 sm:pt-2"
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
          onChange={(event) => {
            setDraft(event.target.value);
            setReferences(/(?:^|\s)@[^\s[\]]*$/.test(event.target.value));
          }}
          className="h-24 min-h-16 max-h-[25dvh] resize-y"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {references &&
          renderReferences?.(
            /(?:^|\s)@([^\s[\]]*)$/.exec(draft)?.[1] ?? "",
            insertReference,
            closeReferences,
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
